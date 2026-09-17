/**
 * @zakkster/lite-logn -- the HARD zero-allocation perf gate (@zakkster/lite-perf-gate).
 *
 * Run:  node --expose-gc --max-semi-space-size=4 --test test/perf/PerfGate.test.mjs
 *
 * A node:test-native COMPLEMENT to torture (0 B/op), not a replacement. Each
 * member session adds a zero-alloc scenario per hot op (push / pop / peek for
 * BinaryHeap; update / prefix for Fenwick; ...), scavenge-scaled at N and k*N
 * with the old-gen and external / arrayBuffers lanes pinned to 0.
 *
 * v0.1.0 ships BinaryHeap; v0.2.0 adds Fenwick; v0.3.0 adds SegmentTree; v0.4.0
 * adds SkipList. This file gates each member's hot ops (BinaryHeap push / pop /
 * changeKey / peek / topKey / keyOf / has; Fenwick update / prefix / at / rangeSum;
 * SegmentTree update / query / at; SkipList get / set / delete / successor) with
 * the backing typed arrays (and the SkipList's private free-stack) fixed at
 * construction, so the `grows` counter (buffer byte length) shows a 0 delta
 * across the whole window. The teeth (`mustFail`) carry an allocating loop that
 * MUST trip the gate, proving the instrument can fail (suite law 8: every gate
 * must be provably able to FAIL). Never widen a budget to make this pass.
 */

import { zgcSuite } from '@zakkster/lite-perf-gate';
import { VERSION, BinaryHeap, Fenwick, SegmentTree, SkipList } from '../../LogN.js';

const CAP = 1 << 14;        // heap capacity 16384
const MASK = CAP - 1;       // power-of-2 mask: id & MASK is always in [0, CAP)

/** The zero-alloc counter: the three backing buffers' byte lengths. Fixed at
 *  construction, so the delta across the window must be 0. */
function grows(s) {
    const h = s.heap;
    return h._key.buffer.byteLength + h._id.buffer.byteLength + h._pos.buffer.byteLength;
}

/** A heap prefilled to capacity: ids 0..CAP-1 all resident, integer keys. */
function fill() {
    const h = new BinaryHeap(CAP, 'min');
    for (let i = 0; i < CAP; i++) h.push(i, (i * 2654435761) & 0xffff);
    return h;
}

/**
 * push/pop churn at steady capacity: the heap starts FULL, each op pops the
 * extremum (freeing one slot) then pushes that same id back with a fresh integer
 * key. Both ops are O(log n) and allocate nothing; the heap never overflows and
 * never empties.
 */
const pushPopChurn = {
    name: 'BinaryHeap push/pop churn',
    setup() { return { heap: fill(), tick: 0 }; },
    hot(s, n) {
        const h = s.heap;
        let t = s.tick | 0;
        for (let i = 0; i < n; i++) {
            const id = h.pop();
            h.push(id, (t * 2654435761) & 0xffff);
            t = (t + 1) | 0;
        }
        s.tick = t | 0;
    },
    statsOf(s) { return { grows: grows(s) }; },
};

/**
 * changeKey churn: a full heap, each op reprioritizes a resident id (cycling
 * through 0..CAP-1) to a fresh integer key -- the auto-direction sift, zero-alloc.
 */
const changeKeyChurn = {
    name: 'BinaryHeap changeKey churn',
    setup() { return { heap: fill(), tick: 0 }; },
    hot(s, n) {
        const h = s.heap;
        let t = s.tick | 0;
        for (let i = 0; i < n; i++) {
            h.changeKey(t & MASK, (t * 40503) & 0xffff);
            t = (t + 1) | 0;
        }
        s.tick = t | 0;
    },
    statsOf(s) { return { grows: grows(s) }; },
};

/**
 * read mix: peek / topKey / keyOf / has over a full heap, folded into an int32
 * accumulator. All O(1), no allocation.
 */
const readMix = {
    name: 'BinaryHeap peek/topKey/keyOf/has',
    setup() { return { heap: fill(), acc: 0 }; },
    hot(s, n) {
        const h = s.heap;
        let acc = s.acc | 0;
        for (let i = 0; i < n; i++) {
            const id = i & MASK;
            acc = (acc + h.peek() + h.topKey() + h.keyOf(id) + (h.has(id) ? 1 : 0)) | 0;
        }
        s.acc = acc | 0;
    },
    statsOf(s) { return { grows: grows(s) }; },
};

/** Fenwick's zero-alloc counter: its single backing buffer's byte length, fixed
 *  at construction, so the delta across the window must be 0. */
function fenGrows(s) { return s.fen._t.buffer.byteLength; }

/** A Fenwick prefilled to capacity with integer values. */
function fenFill() {
    const f = new Fenwick(CAP);
    for (let i = 0; i < CAP; i++) f.update(i, (i * 2654435761) & 0xffff);
    return f;
}

/**
 * update churn: each op adds a balanced +-1 at a cycling index (the `i & -i`
 * climb, one _t touch per level). Balanced signs keep the running sums bounded;
 * zero allocation.
 */
const fenUpdateChurn = {
    name: 'Fenwick update churn',
    setup() { return { fen: fenFill(), tick: 0 }; },
    hot(s, n) {
        const f = s.fen;
        let t = s.tick | 0;
        for (let i = 0; i < n; i++) {
            f.update(t & MASK, (t & 1) ? 1 : -1);
            t = (t + 1) | 0;
        }
        s.tick = t | 0;
    },
    statsOf(s) { return { grows: fenGrows(s) }; },
};

/**
 * prefix churn: each op sums [0, i] for a cycling i (the `i & -i` descent),
 * folded into an int32 accumulator. Zero allocation.
 */
const fenPrefixChurn = {
    name: 'Fenwick prefix churn',
    setup() { return { fen: fenFill(), tick: 0, acc: 0 }; },
    hot(s, n) {
        const f = s.fen;
        let t = s.tick | 0, acc = s.acc | 0;
        for (let i = 0; i < n; i++) {
            acc = (acc + (f.prefix(t & MASK) | 0)) | 0;
            t = (t + 1) | 0;
        }
        s.tick = t | 0;
        s.acc = acc | 0;
    },
    statsOf(s) { return { grows: fenGrows(s) }; },
};

/**
 * at / rangeSum mix: at(i) (two walks) and a fixed-width rangeSum, folded into an
 * int32 accumulator. Both are pairs of prefix walks; zero allocation.
 */
const fenAtRangeMix = {
    name: 'Fenwick at/rangeSum mix',
    setup() { return { fen: fenFill(), tick: 0, acc: 0 }; },
    hot(s, n) {
        const f = s.fen;
        let t = s.tick | 0, acc = s.acc | 0;
        for (let i = 0; i < n; i++) {
            const lo = t & (MASK >> 1);
            acc = (acc + (f.at(t & MASK) | 0) + (f.rangeSum(lo, lo + 100) | 0)) | 0;
            t = (t + 1) | 0;
        }
        s.tick = t | 0;
        s.acc = acc | 0;
    },
    statsOf(s) { return { grows: fenGrows(s) }; },
};

/** SegmentTree's zero-alloc counter: its single backing buffer's byte length,
 *  fixed at construction, so the delta across the window must be 0. */
function segGrows(s) { return s.seg._t.buffer.byteLength; }

/** A SegmentTree prefilled to capacity with integer values (sum fold). */
function segFill() {
    const st = new SegmentTree(CAP, 'sum');
    for (let i = 0; i < CAP; i++) st.update(i, (i * 2654435761) & 0xffff);
    return st;
}

/**
 * update churn: each op sets an ABSOLUTE bounded leaf value then fixes ancestors
 * (one write per level). Bounded values keep the folds finite; zero allocation.
 */
const segUpdateChurn = {
    name: 'SegmentTree update churn',
    setup() { return { seg: segFill(), tick: 0 }; },
    hot(s, n) {
        const st = s.seg;
        let t = s.tick | 0;
        for (let i = 0; i < n; i++) {
            st.update(t & MASK, t & 0xffff);
            t = (t + 1) | 0;
        }
        s.tick = t | 0;
    },
    statsOf(s) { return { grows: segGrows(s) }; },
};

/**
 * query churn: each op folds a fixed-width window (two boundary walks up the
 * tree), folded into an int32 accumulator. Zero allocation.
 */
const segQueryChurn = {
    name: 'SegmentTree query churn',
    setup() { return { seg: segFill(), tick: 0, acc: 0 }; },
    hot(s, n) {
        const st = s.seg;
        let t = s.tick | 0, acc = s.acc | 0;
        for (let i = 0; i < n; i++) {
            const lo = t & (MASK >> 1);
            acc = (acc + (st.query(lo, lo + 100) | 0)) | 0;
            t = (t + 1) | 0;
        }
        s.tick = t | 0;
        s.acc = acc | 0;
    },
    statsOf(s) { return { grows: segGrows(s) }; },
};

/**
 * segGrows / at mix: at(i) (a single leaf read) and a windowed query, folded into
 * an int32 accumulator, proving the backing buffer never grows. Zero allocation.
 */
const segGrowsMix = {
    name: 'SegmentTree at/query mix (buffer never grows)',
    setup() { return { seg: segFill(), tick: 0, acc: 0 }; },
    hot(s, n) {
        const st = s.seg;
        let t = s.tick | 0, acc = s.acc | 0;
        for (let i = 0; i < n; i++) {
            const lo = t & (MASK >> 1);
            acc = (acc + (st.at(t & MASK) | 0) + (st.query(lo, lo + 100) | 0)) | 0;
            t = (t + 1) | 0;
        }
        s.tick = t | 0;
        s.acc = acc | 0;
    },
    statsOf(s) { return { grows: segGrows(s) }; },
};

/** SkipList's zero-alloc counter: its typed-array buffers plus the private pool's
 *  free-stack, all fixed at construction, so the delta across the window must be 0. */
function slGrows(s) {
    const sl = s.sl;
    return sl._next.buffer.byteLength + sl._key.buffer.byteLength +
        sl._val.buffer.byteLength + sl._pool._free.buffer.byteLength;
}

/** A SkipList prefilled to half capacity (a warmed, stable tower). */
function slFill() {
    const sl = new SkipList(CAP, 0x9E3779B9);
    for (let i = 0; i < (CAP >> 1); i++) sl.set(i, (i * 2654435761) & 0xffff);
    return sl;
}

const SLMASK = (CAP >> 1) - 1; // keys 0..CAP/2-1 resident

/**
 * get churn: a hit on a resident cycling key, folded into an int32 accumulator.
 * The descent chases slot INDICES (no heap object); zero allocation.
 */
const slGetChurn = {
    name: 'SkipList get churn',
    setup() { return { sl: slFill(), tick: 0, acc: 0 }; },
    hot(s, n) {
        const sl = s.sl;
        let t = s.tick | 0, acc = s.acc | 0;
        for (let i = 0; i < n; i++) { acc = (acc + (sl.get(t & SLMASK) | 0)) | 0; t = (t + 1) | 0; }
        s.tick = t | 0; s.acc = acc | 0;
    },
    statsOf(s) { return { grows: slGrows(s) }; },
};

/**
 * set churn: an in-place value update of a resident cycling key (no new node) --
 * the pure set hot path, zero allocation.
 */
const slSetChurn = {
    name: 'SkipList set churn (in-place update)',
    setup() { return { sl: slFill(), tick: 0 }; },
    hot(s, n) {
        const sl = s.sl;
        let t = s.tick | 0;
        for (let i = 0; i < n; i++) { sl.set(t & SLMASK, t & 0xffff); t = (t + 1) | 0; }
        s.tick = t | 0;
    },
    statsOf(s) { return { grows: slGrows(s) }; },
};

/**
 * delete + re-set churn: addressable delete then re-insert of the SAME key ->
 * steady size, exercising the private free-list alloc/free (a slot INDEX, no heap
 * object). Zero allocation.
 */
const slDeleteChurn = {
    name: 'SkipList delete + re-set churn',
    setup() { return { sl: slFill(), tick: 0 }; },
    hot(s, n) {
        const sl = s.sl;
        let t = s.tick | 0;
        for (let i = 0; i < n; i++) {
            const key = t & SLMASK;
            if (sl.delete(key)) sl.set(key, t & 0xffff);
            t = (t + 1) | 0;
        }
        s.tick = t | 0;
    },
    statsOf(s) { return { grows: slGrows(s) }; },
};

/**
 * successor churn: a strictly-greater lookup on a resident cycling key, folded
 * into an int32 accumulator. Zero allocation.
 */
const slSuccessorChurn = {
    name: 'SkipList successor churn',
    setup() { return { sl: slFill(), tick: 0, acc: 0 }; },
    hot(s, n) {
        const sl = s.sl;
        let t = s.tick | 0, acc = s.acc | 0;
        for (let i = 0; i < n; i++) {
            const v = sl.successor(t & SLMASK);
            acc = (acc + (v === undefined ? 0 : v | 0)) | 0;
            t = (t + 1) | 0;
        }
        s.tick = t | 0; s.acc = acc | 0;
    },
    statsOf(s) { return { grows: slGrows(s) }; },
};

/**
 * The teeth: a per-op push into a FRESH [] each op -- the array MUST trip the
 * gate (scavenges scale with n), proving the instrument has teeth before any
 * member depends on it. statsOf returns a constant so the failure is the
 * allocation lanes, not a missing-counter artifact.
 */
const teethMustFailAlloc = {
    name: 'scaffold teeth: fresh array per op (MUST allocate)',
    setup() { return { v: VERSION.length | 0, sink: 0 }; },
    hot(s, n) {
        let sink = s.sink | 0;
        for (let i = 0; i < n; i++) {
            const arr = []; // fresh array per op -> heap churn
            arr.push(i & 0xffff);
            sink = (sink + arr.length) | 0;
        }
        s.sink = sink | 0;
    },
    statsOf() { return { grows: 0 }; },
};

zgcSuite({
    N: 200000,
    k: 8,
    maxScavenges: 0,
    maxOldGen: 0,
    maxArrayBuffersKB: 0,
    counters: { grows: 0 },
    maxRetainedKB: 64,
    scenarios: [pushPopChurn, changeKeyChurn, readMix,
        fenUpdateChurn, fenPrefixChurn, fenAtRangeMix,
        segUpdateChurn, segQueryChurn, segGrowsMix,
        slGetChurn, slSetChurn, slDeleteChurn, slSuccessorChurn],
    mustFail: [teethMustFailAlloc],
});
