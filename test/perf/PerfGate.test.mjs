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
import { VERSION, BinaryHeap, Fenwick, SegmentTree, SkipList, Treap, Scapegoat, MinMaxHeap, SplayTree, BinomialHeap } from '../../LogN.js';

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

/** Treap's zero-alloc counter: its six typed-array buffers plus the private pool's
 *  free-stack, all fixed at construction, so the delta across the window must be 0. */
function trGrows(s) {
    const t = s.tr;
    return t._key.buffer.byteLength + t._value.buffer.byteLength +
        t._left.buffer.byteLength + t._right.buffer.byteLength +
        t._prio.buffer.byteLength + t._size.buffer.byteLength +
        t._pool._free.buffer.byteLength;
}

/** A Treap prefilled to half capacity (a warmed, stable tree). */
function trFill() {
    const tr = new Treap(CAP, 0x9E3779B9);
    for (let i = 0; i < (CAP >> 1); i++) tr.set(i, (i * 2654435761) & 0xffff);
    return tr;
}

const TRMASK = (CAP >> 1) - 1; // keys 0..CAP/2-1 resident

/**
 * get churn: a hit on a resident cycling key, folded into an int32 accumulator. The
 * BST descent chases slot INDICES (no heap object); zero allocation.
 */
const trGetChurn = {
    name: 'Treap get churn',
    setup() { return { tr: trFill(), tick: 0, acc: 0 }; },
    hot(s, n) {
        const tr = s.tr;
        let t = s.tick | 0, acc = s.acc | 0;
        for (let i = 0; i < n; i++) { acc = (acc + (tr.get(t & TRMASK) | 0)) | 0; t = (t + 1) | 0; }
        s.tick = t | 0; s.acc = acc | 0;
    },
    statsOf(s) { return { grows: trGrows(s) }; },
};

/**
 * set churn: an in-place value update of a resident cycling key (no new node) -- the
 * pure set hot path, zero allocation.
 */
const trSetChurn = {
    name: 'Treap set churn (in-place update)',
    setup() { return { tr: trFill(), tick: 0 }; },
    hot(s, n) {
        const tr = s.tr;
        let t = s.tick | 0;
        for (let i = 0; i < n; i++) { tr.set(t & TRMASK, t & 0xffff); t = (t + 1) | 0; }
        s.tick = t | 0;
    },
    statsOf(s) { return { grows: trGrows(s) }; },
};

/**
 * delete + re-set churn: addressable delete then re-insert of the SAME key -> steady
 * size, exercising the private free-list alloc/free + the recursive merge/insert
 * (native call stack, no heap object). Zero allocation.
 */
const trDeleteChurn = {
    name: 'Treap delete + re-set churn',
    setup() { return { tr: trFill(), tick: 0 }; },
    hot(s, n) {
        const tr = s.tr;
        let t = s.tick | 0;
        for (let i = 0; i < n; i++) {
            const key = t & TRMASK;
            if (tr.delete(key)) tr.set(key, t & 0xffff);
            t = (t + 1) | 0;
        }
        s.tick = t | 0;
    },
    statsOf(s) { return { grows: trGrows(s) }; },
};

/**
 * rank / select / successor mix: the order-statistic + ordered lookups over a resident
 * cycling key, folded into an int32 accumulator. All O(log n) descents; zero allocation.
 */
const trOrderMix = {
    name: 'Treap rank/select/successor mix',
    setup() { return { tr: trFill(), tick: 0, acc: 0 }; },
    hot(s, n) {
        const tr = s.tr;
        let t = s.tick | 0, acc = s.acc | 0;
        for (let i = 0; i < n; i++) {
            const key = t & TRMASK;
            acc = (acc + (tr.rank(key) | 0)) | 0;
            const sv = tr.select(key & (TRMASK >> 1));
            acc = (acc + (sv === undefined ? 0 : sv | 0)) | 0;
            const su = tr.successor(key);
            acc = (acc + (su === undefined ? 0 : su | 0)) | 0;
            t = (t + 1) | 0;
        }
        s.tick = t | 0; s.acc = acc | 0;
    },
    statsOf(s) { return { grows: trGrows(s) }; },
};

/** Scapegoat's zero-alloc counter: its five typed-array columns, the private pool's
 *  free-stack, PLUS the two rebuild scratch buffers (_flat + _stack) -- all fixed at
 *  construction, so the delta across the window must be 0 even under a rebuild storm. */
function sgGrows(s) {
    const t = s.sg;
    return t._key.buffer.byteLength + t._value.buffer.byteLength +
        t._left.buffer.byteLength + t._right.buffer.byteLength +
        t._size.buffer.byteLength + t._pool._free.buffer.byteLength +
        t._flat.buffer.byteLength + t._stack.buffer.byteLength;
}

/** A Scapegoat prefilled to half capacity (a warmed, stable tree). */
function sgFill() {
    const sg = new Scapegoat(CAP);
    for (let i = 0; i < (CAP >> 1); i++) sg.set(i, (i * 2654435761) & 0xffff);
    return sg;
}

const SGMASK = (CAP >> 1) - 1; // keys 0..CAP/2-1 resident

/**
 * get churn: a hit on a resident cycling key, folded into an int32 accumulator. The
 * deterministic BST descent chases slot INDICES (no heap object); zero allocation.
 */
const sgGetChurn = {
    name: 'Scapegoat get churn',
    setup() { return { sg: sgFill(), tick: 0, acc: 0 }; },
    hot(s, n) {
        const sg = s.sg;
        let t = s.tick | 0, acc = s.acc | 0;
        for (let i = 0; i < n; i++) { acc = (acc + (sg.get(t & SGMASK) | 0)) | 0; t = (t + 1) | 0; }
        s.tick = t | 0; s.acc = acc | 0;
    },
    statsOf(s) { return { grows: sgGrows(s) }; },
};

/**
 * set churn: an in-place value update of a resident cycling key (no new node, no rebuild)
 * -- the pure set hot path, zero allocation.
 */
const sgSetChurn = {
    name: 'Scapegoat set churn (in-place update)',
    setup() { return { sg: sgFill(), tick: 0 }; },
    hot(s, n) {
        const sg = s.sg;
        let t = s.tick | 0;
        for (let i = 0; i < n; i++) { sg.set(t & SGMASK, t & 0xffff); t = (t + 1) | 0; }
        s.tick = t | 0;
    },
    statsOf(s) { return { grows: sgGrows(s) }; },
};

/**
 * delete + re-set churn: addressable delete then re-insert of the SAME key -> steady size,
 * exercising the free-list free/alloc + the recursive delete/insert (native call stack, no
 * heap object). Zero allocation.
 */
const sgDeleteChurn = {
    name: 'Scapegoat delete + re-set churn',
    setup() { return { sg: sgFill(), tick: 0 }; },
    hot(s, n) {
        const sg = s.sg;
        let t = s.tick | 0;
        for (let i = 0; i < n; i++) {
            const key = t & SGMASK;
            if (sg.delete(key)) sg.set(key, t & 0xffff);
            t = (t + 1) | 0;
        }
        s.tick = t | 0;
    },
    statsOf(s) { return { grows: sgGrows(s) }; },
};

/**
 * REBUILD-HEAVY churn: a dedicated small tree fed ever-increasing ASCENDING keys and wrap-
 * cleared when full -- the pathological trace that forces the subtree REBUILD (_flatten +
 * _buildBalanced) to fire repeatedly. The rebuild reuses the preallocated _flat + _stack
 * scratch and the native stack, so the buffer byte lengths never grow: zero allocation even
 * under a rebuild storm. This is the load-bearing scavenge-clean proof for the rebuild path.
 */
const sgRebuildChurn = {
    name: 'Scapegoat rebuild-heavy ascending-insert churn',
    setup() { return { sg: new Scapegoat(512), key: 0 }; },
    hot(s, n) {
        const sg = s.sg;
        let key = s.key | 0;
        for (let i = 0; i < n; i++) {
            if (sg.size >= 511) sg.clear();
            sg.set(key, key & 0xffff);
            key = (key + 1) | 0;
        }
        s.key = key | 0;
    },
    statsOf(s) { return { grows: sgGrows(s) }; },
};

/**
 * rank / select / successor mix: the order-statistic + ordered lookups over a resident
 * cycling key, folded into an int32 accumulator. All O(log n) descents; zero allocation.
 */
const sgOrderMix = {
    name: 'Scapegoat rank/select/successor mix',
    setup() { return { sg: sgFill(), tick: 0, acc: 0 }; },
    hot(s, n) {
        const sg = s.sg;
        let t = s.tick | 0, acc = s.acc | 0;
        for (let i = 0; i < n; i++) {
            const key = t & SGMASK;
            acc = (acc + (sg.rank(key) | 0)) | 0;
            const sv = sg.select(key & (SGMASK >> 1));
            acc = (acc + (sv === undefined ? 0 : sv | 0)) | 0;
            const su = sg.successor(key);
            acc = (acc + (su === undefined ? 0 : su | 0)) | 0;
            t = (t + 1) | 0;
        }
        s.tick = t | 0; s.acc = acc | 0;
    },
    statsOf(s) { return { grows: sgGrows(s) }; },
};

/** MinMaxHeap's zero-alloc counter: its two backing buffers' byte lengths, fixed at
 *  construction, so the delta across the window must be 0. */
function mmhGrows(s) {
    const h = s.mmh;
    return h._key.buffer.byteLength + h._id.buffer.byteLength;
}

/** A MinMaxHeap prefilled to capacity (ids 0..CAP-1 resident, integer keys). */
function mmhFill() {
    const h = new MinMaxHeap(CAP);
    for (let i = 0; i < CAP; i++) h.push(i & 0xffff, (i * 2654435761) & 0xffff);
    return h;
}

/**
 * popMin churn at steady capacity: the heap starts FULL, each op pops the minimum
 * (freeing one slot) then pushes a fresh id/key back. O(log n) trickle-down + sift-up,
 * heap never overflows or empties; zero allocation.
 */
const mmhPopMinChurn = {
    name: 'MinMaxHeap popMin churn',
    setup() { return { mmh: mmhFill(), tick: 0 }; },
    hot(s, n) {
        const h = s.mmh;
        let t = s.tick | 0;
        for (let i = 0; i < n; i++) {
            const id = h.popMin();
            h.push(id, (t * 2654435761) & 0xffff);
            t = (t + 1) | 0;
        }
        s.tick = t | 0;
    },
    statsOf(s) { return { grows: mmhGrows(s) }; },
};

/**
 * popMax churn: a full heap, each op pops the maximum then pushes a fresh id/key back --
 * the other trickle-down path (max-of-{slot1,slot2} then sift-up), zero allocation.
 */
const mmhPopMaxChurn = {
    name: 'MinMaxHeap popMax churn',
    setup() { return { mmh: mmhFill(), tick: 0 }; },
    hot(s, n) {
        const h = s.mmh;
        let t = s.tick | 0;
        for (let i = 0; i < n; i++) {
            const id = h.popMax();
            h.push(id, (t * 40503) & 0xffff);
            t = (t + 1) | 0;
        }
        s.tick = t | 0;
    },
    statsOf(s) { return { grows: mmhGrows(s) }; },
};

/**
 * push/pop-both mixed churn: pop BOTH ends then push both back -> steady full heap, both
 * trickle-downs and both sift-up chains exercised together. Zero allocation.
 */
const mmhMixedChurn = {
    name: 'MinMaxHeap push + popMin + popMax mixed churn',
    setup() { return { mmh: mmhFill(), tick: 0 }; },
    hot(s, n) {
        const h = s.mmh;
        let t = s.tick | 0;
        for (let i = 0; i < n; i++) {
            const lo = h.popMin();
            const hi = h.popMax();
            h.push(lo, (t * 2246822519) & 0xffff);
            h.push(hi, (t * 2654435761) & 0xffff);
            t = (t + 1) | 0;
        }
        s.tick = t | 0;
    },
    statsOf(s) { return { grows: mmhGrows(s) }; },
};

/**
 * read mix: peekMin / peekMax / peekMinKey / peekMaxKey over a full heap, folded into an
 * int32 accumulator. All O(1), no allocation.
 */
const mmhReadMix = {
    name: 'MinMaxHeap peekMin/peekMax/peekMinKey/peekMaxKey',
    setup() { return { mmh: mmhFill(), acc: 0 }; },
    hot(s, n) {
        const h = s.mmh;
        let acc = s.acc | 0;
        for (let i = 0; i < n; i++) {
            acc = (acc + h.peekMin() + h.peekMax() + (h.peekMinKey() | 0) + (h.peekMaxKey() | 0)) | 0;
        }
        s.acc = acc | 0;
    },
    statsOf(s) { return { grows: mmhGrows(s) }; },
};

/** SplayTree's zero-alloc counter: its four typed-array columns plus the private pool's
 *  free-stack, all fixed at construction, so the delta across the window must be 0 even
 *  though every read SPLAYS (rotations only rewrite existing slot links, never allocate). */
function spGrows(s) {
    const t = s.sp;
    return t._key.buffer.byteLength + t._value.buffer.byteLength +
        t._left.buffer.byteLength + t._right.buffer.byteLength +
        t._pool._free.buffer.byteLength;
}

/** A SplayTree prefilled to half capacity (a warmed, stable tree). */
function spFill() {
    const sp = new SplayTree(CAP);
    for (let i = 0; i < (CAP >> 1); i++) sp.set(i, (i * 2654435761) & 0xffff);
    return sp;
}

const SPMASK = (CAP >> 1) - 1; // keys 0..CAP/2-1 resident

/**
 * get churn: a hit on a resident cycling key, folded into an int32 accumulator. The get
 * SPLAYS the touched key to the root (rotations rewrite slot INDICES, no heap object);
 * zero allocation.
 */
const spGetChurn = {
    name: 'SplayTree get churn (splays every read)',
    setup() { return { sp: spFill(), tick: 0, acc: 0 }; },
    hot(s, n) {
        const sp = s.sp;
        let t = s.tick | 0, acc = s.acc | 0;
        for (let i = 0; i < n; i++) { acc = (acc + (sp.get(t & SPMASK) | 0)) | 0; t = (t + 1) | 0; }
        s.tick = t | 0; s.acc = acc | 0;
    },
    statsOf(s) { return { grows: spGrows(s) }; },
};

/**
 * set churn: an in-place value update of a resident cycling key (no new node) -- the pure
 * set hot path (splay + overwrite), zero allocation.
 */
const spSetChurn = {
    name: 'SplayTree set churn (in-place update)',
    setup() { return { sp: spFill(), tick: 0 }; },
    hot(s, n) {
        const sp = s.sp;
        let t = s.tick | 0;
        for (let i = 0; i < n; i++) { sp.set(t & SPMASK, t & 0xffff); t = (t + 1) | 0; }
        s.tick = t | 0;
    },
    statsOf(s) { return { grows: spGrows(s) }; },
};

/**
 * delete + re-set churn: addressable delete then re-insert of the SAME key -> steady size,
 * exercising the private free-list free/alloc + the splay-join (no heap object). Zero allocation.
 */
const spDeleteChurn = {
    name: 'SplayTree delete + re-set churn',
    setup() { return { sp: spFill(), tick: 0 }; },
    hot(s, n) {
        const sp = s.sp;
        let t = s.tick | 0;
        for (let i = 0; i < n; i++) {
            const key = t & SPMASK;
            if (sp.delete(key)) sp.set(key, t & 0xffff);
            t = (t + 1) | 0;
        }
        s.tick = t | 0;
    },
    statsOf(s) { return { grows: spGrows(s) }; },
};

/**
 * successor churn: a strictly-greater lookup on a resident cycling key (SPLAYS the closest
 * node), folded into an int32 accumulator. Zero allocation.
 */
const spSuccessorChurn = {
    name: 'SplayTree successor churn',
    setup() { return { sp: spFill(), tick: 0, acc: 0 }; },
    hot(s, n) {
        const sp = s.sp;
        let t = s.tick | 0, acc = s.acc | 0;
        for (let i = 0; i < n; i++) {
            const v = sp.successor(t & SPMASK);
            acc = (acc + (v === undefined ? 0 : v | 0)) | 0;
            t = (t + 1) | 0;
        }
        s.tick = t | 0; s.acc = acc | 0;
    },
    statsOf(s) { return { grows: spGrows(s) }; },
};

/** BinomialHeap's zero-alloc counter: its six typed-array columns plus the private pool's
 *  free-stack, all fixed at construction, so the delta across the window must be 0 (the
 *  binary-carry union, the child-reverse popMin, and meld all rewrite slot links only). */
function binhGrows(s) {
    const h = s.binh;
    return h._key.buffer.byteLength + h._id.buffer.byteLength +
        h._parent.buffer.byteLength + h._child.buffer.byteLength +
        h._sibling.buffer.byteLength + h._order.buffer.byteLength +
        h._pool._free.buffer.byteLength;
}

/** A standalone BinomialHeap prefilled to capacity (ids 0..CAP-1 resident, integer keys). */
function binhFill() {
    const h = new BinomialHeap(CAP, 'min');
    for (let i = 0; i < CAP; i++) h.push(i & 0xffff, (i * 2654435761) & 0xffff);
    return h;
}

/**
 * push/popMin churn at steady capacity: the heap starts FULL, each op pops the extreme
 * (child-reverse + remeld + root rescan, freeing one slot) then pushes a fresh id/key back
 * (the binary-carry union). Heap never overflows or empties; zero allocation.
 */
const binhPopMinChurn = {
    name: 'BinomialHeap push + popMin churn',
    setup() { return { binh: binhFill(), tick: 0 }; },
    hot(s, n) {
        const h = s.binh;
        let t = s.tick | 0;
        for (let i = 0; i < n; i++) {
            const id = h.popMin();
            h.push(id, (t * 2654435761) & 0xffff);
            t = (t + 1) | 0;
        }
        s.tick = t | 0;
    },
    statsOf(s) { return { grows: binhGrows(s) }; },
};

/**
 * peekMin / peekMinKey over a full heap, folded into an int32 accumulator. Both O(1) reads
 * of the cached extreme root; no allocation.
 */
const binhReadMix = {
    name: 'BinomialHeap peekMin/peekMinKey read mix',
    setup() { return { binh: binhFill(), acc: 0 }; },
    hot(s, n) {
        const h = s.binh;
        let acc = s.acc | 0;
        for (let i = 0; i < n; i++) acc = (acc + h.peekMin() + (h.peekMinKey() | 0)) | 0;
        s.acc = acc | 0;
    },
    statsOf(s) { return { grows: binhGrows(s) }; },
};

/**
 * meld + arena-churn: a fixed two-heap arena. meld CONSUMES its donor (a dead-after-meld
 * heap fails closed on reuse), so to drive the meld hot body REPEATEDLY the donor is
 * refreshed in place (white-box scalar resets -- alloc-free) then reloaded; the melded
 * result is drained back so the arena returns to empty. The measured body is the public
 * meld() binary-carry (byte-identical to push's) + the drain, which allocates zero bytes.
 */
const binhMeldChurn = {
    name: 'BinomialHeap meld + arena-churn',
    setup() {
        const [acc, donor] = BinomialHeap.arena(CAP, 'min', 2);
        return { binh: acc, donor, tick: 0 };
    },
    hot(s, n) {
        const acc = s.binh, donor = s.donor;
        let t = s.tick | 0;
        for (let i = 0; i < n; i++) {
            donor._consumed = false; donor._head = 0; donor._min = 0; donor._n = 0; // alloc-free refresh
            for (let k = 0; k < 8; k++) donor.push((t + k) & 0xffff, ((t + k) * 40503) & 0xffff);
            acc.meld(donor);                       // consumes donor; 0-alloc carry
            for (let k = 0; k < 8; k++) acc.popMin(); // drain back -> steady empty acc
            t = (t + 8) | 0;
        }
        s.tick = t | 0;
    },
    statsOf(s) { return { grows: binhGrows(s) }; },
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
        slGetChurn, slSetChurn, slDeleteChurn, slSuccessorChurn,
        trGetChurn, trSetChurn, trDeleteChurn, trOrderMix,
        sgGetChurn, sgSetChurn, sgDeleteChurn, sgRebuildChurn, sgOrderMix,
        mmhPopMinChurn, mmhPopMaxChurn, mmhMixedChurn, mmhReadMix,
        spGetChurn, spSetChurn, spDeleteChurn, spSuccessorChurn,
        binhPopMinChurn, binhReadMix, binhMeldChurn],
    mustFail: [teethMustFailAlloc],
});
