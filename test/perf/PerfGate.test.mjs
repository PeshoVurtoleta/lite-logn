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
 * v0.1.0 ships BinaryHeap: this file gates its hot ops (push / pop / changeKey /
 * peek / topKey / keyOf / has) with the backing typed arrays fixed at
 * construction, so the `grows` counter (their combined buffer byte length) shows
 * a 0 delta across the whole window. The teeth (`mustFail`) carry an allocating
 * loop that MUST trip the gate, proving the instrument can fail (suite law 8:
 * every gate must be provably able to FAIL). Never widen a budget to make this
 * pass.
 */

import { zgcSuite } from '@zakkster/lite-perf-gate';
import { VERSION, BinaryHeap } from '../../LogN.js';

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
    scenarios: [pushPopChurn, changeKeyChurn, readMix],
    mustFail: [teethMustFailAlloc],
});
