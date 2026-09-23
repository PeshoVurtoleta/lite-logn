// @zakkster/lite-logn -- demo hot kernels (repo-only dev artifact, NEVER shipped).
//
// Pure, zero-allocation-after-warmup world factories + per-op step kernels that wrap the REAL
// shipped classes of ../LogN.js, across four thematic scenes covering all SIXTEEN members. This
// module is imported by BOTH:
//   - demo/index.html    (the browser rAF loop -- the visualization state IS these classes)
//   - demo/Demo.test.mjs (the honesty gate -- faithfulness + version-trinity + 0-B/op + pins)
//
// The one non-negotiable (DEMO.md section 0): the demo demonstrates zero-GC, so the demo's own
// per-frame math must itself be zero-GC. Every stepX / snapshotX allocates ZERO bytes after
// warmup; all allocation lives in a createXWorld factory. The ONLY frame allocators are the six
// naive FOILS, each marked "FOIL: allocates ON PURPOSE -- this is the point". ASCII-only per
// suite law. Every throw here carries the [lite-logn-demo] prefix (never [lite-logn]).

import {
    BinaryHeap, MinMaxHeap, BinomialHeap, PairingHeap, FibonacciHeap,
    SkipList, Treap, Scapegoat, SplayTree, SortedArray,
    Fenwick, SegmentTree, Fenwick2D, SegmentTree2D,
    PersistentSegTree, MergeSortTree,
    VERSION,
} from '../LogN.js';

// Re-export the SHIPPED VERSION so index.html and Demo.test.mjs read the one true source
// (never a hardcoded string -- the version-trinity test in Demo.test.mjs gates this).
export { VERSION };

// ---- deterministic PRNG (integer state, zero-alloc) -----------------------------------
// mulberry32 over a Uint32Array(1) state cell: no closure, no boxed HeapNumber, no wall-clock.
// Reads and advances state[0] in place; returns a uint32 in [0, 2^32).
export function makeRng(seed) {
    const s = new Uint32Array(1);
    s[0] = seed >>> 0;
    return s;
}

export function nextU32(state) {
    let a = (state[0] + 0x6d2b79f5) | 0;
    state[0] = a >>> 0;
    a = Math.imul(a ^ (a >>> 15), a | 1);
    a ^= a + Math.imul(a ^ (a >>> 7), a | 61);
    return (a ^ (a >>> 14)) >>> 0;
}

/** A uint32 in [0, range). range must be >= 1. Zero-alloc. */
export function nextKey(state, range) {
    return nextU32(state) % range;
}

// A shared live-key ring (pow2-masked) so ordered-map steps can target keys that are actually
// present. Allocated in createXWorld, indexed with a bitmask, never grown on the hot path.
function ringPush(ring, w, key) {
    ring[w.rhead & w.rmask] = key;
    w.rhead = (w.rhead + 1) | 0;
}
function ringSample(ring, w, r) {
    return ring[r & w.rmask];
}

// =======================================================================================
// SCENE 01 -- Priority Queues (BinaryHeap, MinMaxHeap, BinomialHeap, PairingHeap, FibonacciHeap)
// =======================================================================================

// ---- BinaryHeap (worst-case) ----------------------------------------------------------
export function createBinaryHeapWorld(cap, target) {
    const heap = new BinaryHeap(cap, 'min');
    const rng = makeRng(0x1a2b3c4d);
    const snap = {
        key: new Float64Array(cap), id: new Uint32Array(cap), pos: new Int32Array(cap),
        n: 0, cap, min: true,
    };
    return { heap, rng, cap, target, lastOp: 0, lastId: -1, lastKey: 0, maxNs: 0, snap };
}
export function stepBinaryHeapWorld(w) {
    const h = w.heap, size = h.size, cap = w.cap;
    const r = nextU32(w.rng);
    if (size < w.target && size < cap) {
        const start = r % cap;
        for (let s = 0; s < cap; s++) {
            const j = (start + s) % cap;
            if (!h.has(j)) { const k = nextU32(w.rng) & 0xffff; h.push(j, k); w.lastOp = 1; w.lastId = j; w.lastKey = k; return; }
        }
        w.lastOp = 0; return;
    }
    const branch = r & 3;
    if (branch === 0 && size > 0) {
        const start = nextU32(w.rng) % cap;
        for (let s = 0; s < cap; s++) {
            const j = (start + s) % cap;
            if (h.has(j)) { const k = nextU32(w.rng) & 0xffff; h.changeKey(j, k); w.lastOp = 3; w.lastId = j; w.lastKey = k; return; }
        }
    }
    if (branch === 1 && size > 0) {
        const start = nextU32(w.rng) % cap;
        for (let s = 0; s < cap; s++) {
            const j = (start + s) % cap;
            if (h.has(j)) { h.remove(j); w.lastOp = 4; w.lastId = j; return; }
        }
    }
    if (size > 0) { const top = h.pop(); w.lastOp = 2; w.lastId = top === undefined ? -1 : top; return; }
    w.lastOp = 0;
}
export function snapshotBinaryHeap(w, out) {
    const h = w.heap;
    out.key.set(h._key); out.id.set(h._id); out.pos.set(h._pos);
    out.n = h._n; out.cap = h._cap; out.min = h._min;
    return out.n;
}

// ---- MinMaxHeap (worst-case, both ends) -----------------------------------------------
export function createMinMaxHeapWorld(cap, target) {
    const heap = new MinMaxHeap(cap);
    const rng = makeRng(0x2b3c4d5e);
    const snap = { key: new Float64Array(cap), id: new Uint32Array(cap), n: 0, cap };
    return { heap, rng, cap, target, lastOp: 0, lastId: -1, lastKey: 0, maxNs: 0, snap };
}
export function stepMinMaxHeapWorld(w) {
    const h = w.heap, size = h.size, cap = w.cap;
    const r = nextU32(w.rng);
    if (size < w.target && size < cap) {
        // MinMaxHeap keys are the ids' own priorities; id doubles as payload. Use a rolling id.
        const id = r % cap;
        const k = nextU32(w.rng) & 0xffff;
        h.push(id, k); w.lastOp = 1; w.lastId = id; w.lastKey = k; return;
    }
    if (size > 0) {
        if (r & 1) { const x = h.popMin(); w.lastOp = 2; w.lastId = x === undefined ? -1 : x; }
        else { const x = h.popMax(); w.lastOp = 5; w.lastId = x === undefined ? -1 : x; }
        return;
    }
    w.lastOp = 0;
}
export function snapshotMinMaxHeap(w, out) {
    const h = w.heap;
    out.key.set(h._key); out.id.set(h._id);
    out.n = h._n; out.cap = h._cap;
    return out.n;
}

// ---- BinomialHeap (worst-case popMin) -------------------------------------------------
// Steady push/popMin drives the root-list carry-merge (popMin re-melds the child root list).
export function createBinomialHeapWorld(cap, target) {
    const heap = new BinomialHeap(cap, 'min');
    const rng = makeRng(0x3c4d5e6f);
    const snap = {
        key: new Float64Array(cap + 1), id: new Uint32Array(cap + 1),
        parent: new Uint32Array(cap + 1), child: new Uint32Array(cap + 1),
        sibling: new Uint32Array(cap + 1), order: new Uint32Array(cap + 1),
        head: 0, min: 0, n: 0, isMin: true, consumed: false, cap,
    };
    return { heap, rng, cap, target, seq: 0, lastOp: 0, lastId: -1, lastKey: 0, maxNs: 0, snap };
}
export function stepBinomialHeapWorld(w) {
    const h = w.heap, size = h.size, cap = w.cap;
    const r = nextU32(w.rng);
    if (size < w.target && size < cap) {
        // BinomialHeap _id is an OPAQUE payload (not addressable) -- duplicates are legal.
        const id = w.seq % cap; w.seq = (w.seq + 1) | 0;
        const k = r & 0xffff;
        h.push(id, k); w.lastOp = 1; w.lastId = id; w.lastKey = k; return;
    }
    if (size > 0) { const x = h.popMin(); w.lastOp = 2; w.lastId = x === undefined ? -1 : x; return; }
    w.lastOp = 0;
}
export function snapshotBinomialHeap(w, out) {
    const h = w.heap;
    out.key.set(h._key); out.id.set(h._id); out.parent.set(h._parent);
    out.child.set(h._child); out.sibling.set(h._sibling); out.order.set(h._order);
    out.head = h._head; out.min = h._min; out.n = h._n;
    out.isMin = h._isMin; out.consumed = h._consumed; out.cap = h._cap;
    return out.n;
}

// ---- PairingHeap (AMORTIZED, disclosed max: two-pass merge spike after popMin) ---------
export function createPairingHeapWorld(cap, target) {
    const heap = new PairingHeap(cap, 'min');
    const rng = makeRng(0x4d5e6f70);
    const snap = {
        key: new Float64Array(cap + 1), id: new Uint32Array(cap + 1),
        child: new Uint32Array(cap + 1), sibling: new Uint32Array(cap + 1),
        parent: new Uint32Array(cap + 1), pos: new Int32Array(cap),
        owner: new Uint32Array(cap + 1), alias: new Int32Array(2),
        root: 0, n: 0, cap,
    };
    return { heap, rng, cap, target, seq: 0, lastOp: 0, lastId: -1, lastKey: 0, maxNs: 0, snap };
}
export function stepPairingHeapWorld(w) {
    const h = w.heap, size = h.size, cap = w.cap;
    const r = nextU32(w.rng);
    if (size < w.target && size < cap) {
        const start = r % cap;
        for (let s = 0; s < cap; s++) {
            const j = (start + s) % cap;
            if (!h.has(j)) { const k = nextU32(w.rng) & 0xffff; h.push(j, k); w.lastOp = 1; w.lastId = j; w.lastKey = k; return; }
        }
        w.lastOp = 0; return;
    }
    if ((r & 1) && size > 0) {
        // decreaseKey a present id to a strictly smaller key.
        const start = nextU32(w.rng) % cap;
        for (let s = 0; s < cap; s++) {
            const j = (start + s) % cap;
            if (h.has(j)) {
                const cur = h.keyOf(j);
                if (cur > -0x8000) { h.decreaseKey(j, cur - 1); w.lastOp = 3; w.lastId = j; w.lastKey = cur - 1; return; }
            }
        }
    }
    if (size > 0) {
        const t0 = performance.now();
        const x = h.popMin();
        const dt = performance.now() - t0;
        if (dt > w.maxNs) w.maxNs = dt;
        w.lastOp = 2; w.lastId = x === undefined ? -1 : x; return;
    }
    w.lastOp = 0;
}
export function snapshotPairingHeap(w, out) {
    const h = w.heap;
    out.key.set(h._key); out.id.set(h._id); out.child.set(h._child);
    out.sibling.set(h._sibling); out.parent.set(h._parent); out.pos.set(h._pos);
    out.owner.set(h._owner); out.alias.set(h._alias);
    out.root = h._root; out.n = h._n; out.cap = h._cap;
    return out.n;
}

// ---- FibonacciHeap (AMORTIZED, disclosed max: consolidate spike) ----------------------
export function createFibonacciHeapWorld(cap, target) {
    const heap = new FibonacciHeap(cap, 'min');
    const rng = makeRng(0x5e6f7081);
    const blen = heap._bucket.length;
    const snap = {
        key: new Float64Array(cap + 1), id: new Uint32Array(cap + 1),
        left: new Uint32Array(cap + 1), right: new Uint32Array(cap + 1),
        child: new Uint32Array(cap + 1), parent: new Uint32Array(cap + 1),
        degree: new Uint32Array(cap + 1), mark: new Uint8Array(cap + 1),
        pos: new Int32Array(cap), owner: new Uint32Array(cap + 1),
        bucket: new Uint32Array(blen), min: 0, n: 0, hid: 1, consumed: false, cap,
    };
    return { heap, rng, cap, target, seq: 0, lastOp: 0, lastId: -1, lastKey: 0, maxNs: 0, snap };
}
export function stepFibonacciHeapWorld(w) {
    const h = w.heap, size = h.size, cap = w.cap;
    const r = nextU32(w.rng);
    if (size < w.target && size < cap) {
        const start = r % cap;
        for (let s = 0; s < cap; s++) {
            const j = (start + s) % cap;
            if (!h.has(j)) { const k = nextU32(w.rng) & 0xffff; h.push(j, k); w.lastOp = 1; w.lastId = j; w.lastKey = k; return; }
        }
        w.lastOp = 0; return;
    }
    if ((r & 1) && size > 0) {
        const start = nextU32(w.rng) % cap;
        for (let s = 0; s < cap; s++) {
            const j = (start + s) % cap;
            if (h.has(j)) {
                const cur = h.keyOf(j);
                if (cur > -0x8000) { h.decreaseKey(j, cur - 1); w.lastOp = 3; w.lastId = j; w.lastKey = cur - 1; return; }
            }
        }
    }
    if (size > 0) {
        const t0 = performance.now();
        const x = h.popMin();
        const dt = performance.now() - t0;
        if (dt > w.maxNs) w.maxNs = dt;
        w.lastOp = 2; w.lastId = x === undefined ? -1 : x; return;
    }
    w.lastOp = 0;
}
export function snapshotFibonacciHeap(w, out) {
    const h = w.heap;
    out.key.set(h._key); out.id.set(h._id); out.left.set(h._left); out.right.set(h._right);
    out.child.set(h._child); out.parent.set(h._parent); out.degree.set(h._degree);
    out.mark.set(h._mark); out.pos.set(h._pos); out.owner.set(h._owner); out.bucket.set(h._bucket);
    out.min = h._min; out.n = h._n; out.hid = h._hid; out.consumed = h._consumed; out.cap = h._cap;
    return out.n;
}

// ---- Scene-01 naive FOIL --------------------------------------------------------------
/**
 * The unsorted-array priority queue: push appends, pop rescans the whole array for the min
 * (O(n) per extraction, O(n^2) drain). Allocates a fresh backing array + result each call.
 * @returns {number} the extracted min (folded so the scan survives DCE)
 */
export function foilLinearScanPQ(len) {
    // FOIL: allocates ON PURPOSE -- this is the point (the lite path never does).
    const arr = new Array(len);
    for (let i = 0; i < len; i++) arr[i] = (i * 2654435761) & 0xffff;
    let mi = 0, mv = arr[0];
    for (let i = 1; i < len; i++) if (arr[i] < mv) { mv = arr[i]; mi = i; }
    arr.splice(mi, 1);
    return mv;
}

// =======================================================================================
// SCENE 02 -- Ordered Maps (SkipList, Treap, Scapegoat, SplayTree, SortedArray)
// =======================================================================================

const KEYSPAN = 1 << 20;

// Prefill an ordered map to ~target live entries during warmup (cold path).
function prefillMap(w, setKV) {
    const cap = w.cap, target = w.target, rng = w.rng, ring = w.kring;
    let placed = 0, guard = 0;
    while (placed < target && guard < cap * 4) {
        const k = nextKey(rng, KEYSPAN);
        setKV(k, k & 0xffff);
        ringPush(ring, w, k);
        placed++; guard++;
    }
}

// ---- SkipList (EXPECTED, disclosed max) -----------------------------------------------
export function createSkipListWorld(cap, target) {
    const list = new SkipList(cap, 0x11223344);
    const rng = makeRng(0x6f708192);
    const rcap = 4096, rmask = rcap - 1;
    const cols = list._maxLevel;
    const snap = {
        key: new Float64Array(cap + 1), val: new Float64Array(cap + 1),
        next: new Uint32Array(cols * (cap + 1)), update: new Uint32Array(cols),
        level: 1, maxLevel: cols, size: 0, stride: list._stride, cap, version: 0,
    };
    const w = { list, rng, cap, target, kring: new Float64Array(rcap), rmask, rhead: 0,
        lastOp: 0, lastKey: 0, maxNs: 0, snap };
    prefillMap(w, (k, v) => list.set(k, v));
    return w;
}
export function stepSkipListWorld(w) {
    const l = w.list, size = l.size, cap = w.cap;
    const r = nextU32(w.rng);
    const b = r & 3;
    if (b === 0 && size < w.target && size < cap) {
        const k = nextKey(w.rng, KEYSPAN); l.set(k, k & 0xffff); ringPush(w.kring, w, k);
        w.lastOp = 1; w.lastKey = k; return;
    }
    if (b === 1 && size > 0) {
        const k = ringSample(w.kring, w, nextU32(w.rng)); l.delete(k);
        w.lastOp = 2; w.lastKey = k; return;
    }
    if (b === 2) {
        const k = ringSample(w.kring, w, nextU32(w.rng));
        const t0 = performance.now(); l.get(k); const dt = performance.now() - t0;
        if (dt > w.maxNs) w.maxNs = dt;
        w.lastOp = 3; w.lastKey = k; return;
    }
    const k = ringSample(w.kring, w, nextU32(w.rng)); l.successor(k);
    w.lastOp = 4; w.lastKey = k;
}
export function snapshotSkipList(w, out) {
    const l = w.list;
    out.key.set(l._key); out.val.set(l._val); out.next.set(l._next); out.update.set(l._update);
    out.level = l._level; out.maxLevel = l._maxLevel; out.size = l._size;
    out.stride = l._stride; out.cap = l._cap; out.version = l._version;
    return out.size;
}

// ---- Treap (EXPECTED, disclosed max; rank/select drive a percentile marker) -----------
export function createTreapWorld(cap, target) {
    const treap = new Treap(cap, 0x22334455);
    const rng = makeRng(0x70819243);
    const rcap = 4096, rmask = rcap - 1;
    const snap = {
        key: new Float64Array(cap + 1), value: new Float64Array(cap + 1),
        left: new Uint32Array(cap + 1), right: new Uint32Array(cap + 1),
        prio: new Uint32Array(cap + 1), size: new Uint32Array(cap + 1),
        root: 0, sr: 0, version: 0, n: 0, cap,
    };
    const w = { treap, rng, cap, target, kring: new Float64Array(rcap), rmask, rhead: 0,
        lastOp: 0, lastKey: 0, rankVal: 0, maxNs: 0, snap };
    prefillMap(w, (k, v) => treap.set(k, v));
    return w;
}
export function stepTreapWorld(w) {
    const t = w.treap, size = t.size, cap = w.cap;
    const r = nextU32(w.rng);
    const b = r & 3;
    if (b === 0 && size < w.target && size < cap) {
        const k = nextKey(w.rng, KEYSPAN); t.set(k, k & 0xffff); ringPush(w.kring, w, k);
        w.lastOp = 1; w.lastKey = k; return;
    }
    if (b === 1 && size > 0) {
        const k = ringSample(w.kring, w, nextU32(w.rng)); t.delete(k);
        w.lastOp = 2; w.lastKey = k; return;
    }
    if (b === 2) {
        const k = ringSample(w.kring, w, nextU32(w.rng));
        const t0 = performance.now(); t.get(k); const dt = performance.now() - t0;
        if (dt > w.maxNs) w.maxNs = dt;
        w.lastOp = 3; w.lastKey = k; return;
    }
    // rank/select percentile marker
    if (size > 0) {
        const idx = nextU32(w.rng) % size;
        w.rankVal = t.select(idx);
        w.lastOp = 5; w.lastKey = w.rankVal;
    }
}
export function snapshotTreap(w, out) {
    const t = w.treap;
    out.key.set(t._key); out.value.set(t._value); out.left.set(t._left); out.right.set(t._right);
    out.prio.set(t._prio); out.size.set(t._size);
    out.root = t._root; out.sr = t._sr; out.version = t._version; out.n = t.size;
    return out.n;
}

// ---- Scapegoat (get WORST-CASE straight log; set/delete amortized, rebuild flagged) ----
export function createScapegoatWorld(cap, target) {
    const tree = new Scapegoat(cap, 2 / 3);
    const rng = makeRng(0x81924354);
    const rcap = 4096, rmask = rcap - 1;
    const snap = {
        key: new Float64Array(cap + 1), value: new Float64Array(cap + 1),
        left: new Uint32Array(cap + 1), right: new Uint32Array(cap + 1),
        size: new Uint32Array(cap + 1), flat: new Uint32Array(cap), stack: new Uint32Array(cap + 1),
        root: 0, maxCount: 0, version: 0, alpha: 2 / 3, invAlpha: 1.5, n: 0, cap,
    };
    const w = { tree, rng, cap, target, kring: new Float64Array(rcap), rmask, rhead: 0,
        lastOp: 0, lastKey: 0, lastMaxCount: 0, rebuilt: false, maxNs: 0, snap };
    prefillMap(w, (k, v) => tree.set(k, v));
    return w;
}
export function stepScapegoatWorld(w) {
    const t = w.tree, size = t.size, cap = w.cap;
    const r = nextU32(w.rng);
    const b = r & 3;
    const before = t._maxCount;
    if (b === 0 && size < w.target && size < cap) {
        const k = nextKey(w.rng, KEYSPAN); t.set(k, k & 0xffff); ringPush(w.kring, w, k);
        w.rebuilt = t._maxCount < before; w.lastOp = 1; w.lastKey = k; return;
    }
    if (b === 1 && size > 0) {
        const k = ringSample(w.kring, w, nextU32(w.rng)); t.delete(k);
        w.rebuilt = t._maxCount < before; w.lastOp = 2; w.lastKey = k; return;
    }
    // get is worst-case O(log n): no spike, never flagged as a rebuild.
    const k = ringSample(w.kring, w, nextU32(w.rng)); t.get(k);
    w.rebuilt = false; w.lastOp = 3; w.lastKey = k;
}
export function snapshotScapegoat(w, out) {
    const t = w.tree;
    out.key.set(t._key); out.value.set(t._value); out.left.set(t._left); out.right.set(t._right);
    out.size.set(t._size); out.flat.set(t._flat); out.stack.set(t._stack);
    out.root = t._root; out.maxCount = t._maxCount; out.version = t._version;
    out.alpha = t._alpha; out.invAlpha = t._invAlpha; out.n = t.size;
    return out.n;
}

// ---- SplayTree (AMORTIZED, disclosed max; 80/20 skew migrates the hot key to _root) ----
export function createSplayTreeWorld(cap, target) {
    const tree = new SplayTree(cap);
    const rng = makeRng(0x92435465);
    const rcap = 4096, rmask = rcap - 1;
    const snap = {
        key: new Float64Array(cap + 1), value: new Float64Array(cap + 1),
        left: new Uint32Array(cap + 1), right: new Uint32Array(cap + 1),
        root: 0, hl: 0, hr: 0, version: 0, n: 0, cap,
    };
    const w = { tree, rng, cap, target, kring: new Float64Array(rcap), rmask, rhead: 0,
        hotKey: 0, lastOp: 0, lastKey: 0, maxNs: 0, snap };
    prefillMap(w, (k, v) => tree.set(k, v));
    w.hotKey = w.kring[0];
    return w;
}
export function stepSplayTreeWorld(w) {
    const t = w.tree, size = t.size;
    const r = nextU32(w.rng);
    // 80/20: four of five gets target the single hot key so it visibly rides to the root.
    let k;
    if ((r % 5) < 4) k = w.hotKey;
    else k = ringSample(w.kring, w, nextU32(w.rng));
    const t0 = performance.now(); t.get(k); const dt = performance.now() - t0;
    if (dt > w.maxNs) w.maxNs = dt;
    w.lastOp = 3; w.lastKey = k;
    return size;
}
export function snapshotSplayTree(w, out) {
    const t = w.tree;
    out.key.set(t._key); out.value.set(t._value); out.left.set(t._left); out.right.set(t._right);
    out.root = t._root; out.hl = t._hl; out.hr = t._hr; out.version = t._version; out.n = t.size;
    return out.n;
}

// ---- SortedArray (get WORST-CASE straight log; set/delete O(n) disclosed) --------------
export function createSortedArrayWorld(cap, target) {
    const arr = new SortedArray(cap);
    const rng = makeRng(0xa3546576);
    const rcap = 4096, rmask = rcap - 1;
    const snap = { key: new Float64Array(cap), value: new Float64Array(cap), size: 0, cap, version: 0 };
    const w = { arr, rng, cap, target, kring: new Float64Array(rcap), rmask, rhead: 0,
        probe: 0, lastOp: 0, lastKey: 0, maxNs: 0, snap };
    prefillMap(w, (k, v) => arr.set(k, v));
    return w;
}
export function stepSortedArrayWorld(w) {
    const a = w.arr, size = a.size, cap = w.cap;
    const r = nextU32(w.rng);
    const b = r & 3;
    if (b === 0 && size < w.target && size < cap) {
        const k = nextKey(w.rng, KEYSPAN); a.set(k, k & 0xffff); ringPush(w.kring, w, k);
        w.lastOp = 1; w.lastKey = k; return;
    }
    if (b === 1 && size > 0) {
        const k = ringSample(w.kring, w, nextU32(w.rng)); a.delete(k);
        w.lastOp = 2; w.lastKey = k; return;
    }
    if (b === 2 && size > 0) {
        const idx = nextU32(w.rng) % size; w.probe = a.keyAt(idx);
        w.lastOp = 6; w.lastKey = w.probe; return;
    }
    // get is worst-case O(log n) via binary search.
    const k = ringSample(w.kring, w, nextU32(w.rng)); a.get(k);
    w.lastOp = 3; w.lastKey = k;
}
export function snapshotSortedArray(w, out) {
    const a = w.arr;
    out.key.set(a._key); out.value.set(a._value);
    out.size = a._size; out.cap = a._cap; out.version = a._version;
    return out.size;
}

// ---- Scene-02 naive FOIL --------------------------------------------------------------
/**
 * The plain-array ordered map: O(n) memmove insert + linear key scan (mirrors
 * test/witness.mjs sortedArrayInsert). Allocates a fresh backing array + result each call.
 * @returns {number} the found index (folded so the scan survives DCE)
 */
export function foilSortedArrayInsertScan(len, key) {
    // FOIL: allocates ON PURPOSE -- this is the point (the lite path never does).
    const arr = new Float64Array(len + 1);
    for (let i = 0; i < len; i++) arr[i] = i * 2;
    let lo = 0, hi = len;
    while (lo < hi) { const mid = (lo + hi) >> 1; if (arr[mid] < key) lo = mid + 1; else hi = mid; }
    for (let i = len; i > lo; i--) arr[i] = arr[i - 1];
    arr[lo] = key;
    let found = -1;
    for (let i = 0; i <= len; i++) if (arr[i] === key) { found = i; break; }
    return found;
}

// =======================================================================================
// SCENE 03 -- Range & Prefix (Fenwick, SegmentTree, Fenwick2D, SegmentTree2D)
// =======================================================================================

// ---- Fenwick (worst-case) -------------------------------------------------------------
export function createFenwickWorld(n) {
    const bit = new Fenwick(n);
    const rng = makeRng(0xb4657687);
    const snap = { t: new Float64Array(n + 1), n };
    return { bit, rng, n, idx: 0, lastOp: 0, lastIdx: 0, sum: 0, maxNs: 0, snap };
}
export function stepFenwickWorld(w) {
    const bit = w.bit, n = w.n;
    const r = nextU32(w.rng);
    if (r & 1) {
        const i = r % n; const d = (nextU32(w.rng) & 15) - 8;
        bit.update(i, d); w.lastOp = 1; w.lastIdx = i; return;
    }
    const i = r % n; w.sum = bit.prefix(i); w.lastOp = 2; w.lastIdx = i;
}
export function snapshotFenwick(w, out) {
    out.t.set(w.bit._t); out.n = w.bit._n;
    return out.n;
}

// ---- SegmentTree (worst-case; fold cycled min/max/sum/gcd on a slow timer) -------------
const SEG_KINDS = ['min', 'max', 'sum', 'gcd'];
export function createSegmentTreeWorld(n) {
    const trees = [new SegmentTree(n, 'min'), new SegmentTree(n, 'max'),
        new SegmentTree(n, 'sum'), new SegmentTree(n, 'gcd')];
    const rng = makeRng(0xc5768798);
    const snap = { t: new Float64Array(2 * n), n, k: 0, idv: 0 };
    return { trees, rng, n, active: 0, tick: 0, lastOp: 0, lastIdx: 0, val: 0, maxNs: 0, snap };
}
export function stepSegmentTreeWorld(w) {
    w.tick = (w.tick + 1) | 0;
    if ((w.tick & 511) === 0) w.active = (w.active + 1) & 3;
    const tree = w.trees[w.active], n = w.n;
    const r = nextU32(w.rng);
    if (r & 1) {
        const i = r % n; const v = (nextU32(w.rng) & 63) + 1;
        tree.update(i, v); w.lastOp = 1; w.lastIdx = i; return;
    }
    const lo = r % n; const hi = lo + (nextU32(w.rng) % (n - lo));
    w.val = tree.query(lo, hi); w.lastOp = 2; w.lastIdx = lo;
}
export function snapshotSegmentTree(w, out) {
    const tree = w.trees[w.active];
    out.t.set(tree._t); out.n = tree._n; out.k = tree._k; out.idv = tree._idv;
    return out.n;
}

// ---- Fenwick2D (SQUARED-log axis) -----------------------------------------------------
export function createFenwick2DWorld(rows, cols) {
    const grid = new Fenwick2D(rows, cols);
    const rng = makeRng(0xd6879809);
    const snap = { t: new Float64Array((rows + 1) * (cols + 1)), r: rows, c: cols, w: cols + 1 };
    return { grid, rng, rows, cols, hotR: 0, hotC: 0, lastOp: 0, sum: 0, maxNs: 0, snap };
}
export function stepFenwick2DWorld(w) {
    const g = w.grid, rows = w.rows, cols = w.cols;
    const r = nextU32(w.rng);
    if (r & 1) {
        const rr = r % rows; const cc = nextU32(w.rng) % cols; const d = (nextU32(w.rng) & 7) - 3;
        g.update(rr, cc, d); w.hotR = rr; w.hotC = cc; w.lastOp = 1; return;
    }
    const r1 = r % rows; const c1 = nextU32(w.rng) % cols;
    const r2 = r1 + (nextU32(w.rng) % (rows - r1)); const c2 = c1 + (nextU32(w.rng) % (cols - c1));
    w.sum = g.rectSum(r1, c1, r2, c2); w.lastOp = 2;
}
export function snapshotFenwick2D(w, out) {
    const g = w.grid;
    out.t.set(g._t); out.r = g._r; out.c = g._c; out.w = g._w;
    return g._r * g._c;
}

// ---- SegmentTree2D (SQUARED-log axis) -------------------------------------------------
export function createSegmentTree2DWorld(rows, cols) {
    const grid = new SegmentTree2D(rows, cols, 'max');
    const rng = makeRng(0xe798890a);
    const snap = { t: new Float64Array(2 * rows * 2 * cols), r: rows, c: cols, w: 2 * cols, k: 1, idv: -Infinity };
    return { grid, rng, rows, cols, hotR: 0, hotC: 0, lastOp: 0, val: 0, maxNs: 0, snap };
}
export function stepSegmentTree2DWorld(w) {
    const g = w.grid, rows = w.rows, cols = w.cols;
    const r = nextU32(w.rng);
    if (r & 1) {
        const rr = r % rows; const cc = nextU32(w.rng) % cols; const v = (nextU32(w.rng) & 255) + 1;
        g.update(rr, cc, v); w.hotR = rr; w.hotC = cc; w.lastOp = 1; return;
    }
    const r1 = r % rows; const c1 = nextU32(w.rng) % cols;
    const r2 = r1 + (nextU32(w.rng) % (rows - r1)); const c2 = c1 + (nextU32(w.rng) % (cols - c1));
    w.val = g.query(r1, c1, r2, c2); w.lastOp = 2;
}
export function snapshotSegmentTree2D(w, out) {
    const g = w.grid;
    out.t.set(g._t); out.r = g._r; out.c = g._c; out.w = g._w; out.k = g._k; out.idv = g._idv;
    return g._r * g._c;
}

// ---- Scene-03 naive FOILS -------------------------------------------------------------
/** 1D O(n) prefix rebuild per write. Allocates a fresh prefix array each call. */
export function foilPrefixRebuild(n, writeIdx, delta) {
    // FOIL: allocates ON PURPOSE -- this is the point.
    const base = new Float64Array(n);
    base[writeIdx % n] += delta;
    const pre = new Float64Array(n + 1);
    for (let i = 0; i < n; i++) pre[i + 1] = pre[i] + base[i];
    return pre[n];
}
/** 2D O(n^2) grid rebuild per write. Allocates a fresh grid each call. */
export function foilGridRebuild(rows, cols) {
    // FOIL: allocates ON PURPOSE -- this is the point.
    const g = new Float64Array(rows * cols);
    let sum = 0;
    for (let i = 0; i < rows * cols; i++) { g[i] = (i * 2654435761) & 7; sum += g[i]; }
    return sum;
}

// =======================================================================================
// SCENE 04 -- Time-Travel & Offline (PersistentSegTree, MergeSortTree)
// =======================================================================================

// ---- PersistentSegTree (worst-case query, single log2(n) axis) ------------------------
export function createPersistentSegTreeWorld(n, versionCap) {
    // Seed v0 with a deterministic ramp so historical queries have real content.
    const seed = new Float64Array(n);
    for (let i = 0; i < n; i++) seed[i] = (i * 7 + 3) & 255;
    const pst = PersistentSegTree.build(seed, versionCap, 'sum');
    const rng = makeRng(0xf8990a1b);
    const budget = pst._budget;
    const snap = {
        val: new Float64Array(budget), left: new Uint32Array(budget), right: new Uint32Array(budget),
        roots: new Uint32Array(versionCap + 1),
        next: 0, vcount: 0, vcap: versionCap, budget, n, k: 2, idv: 0,
    };
    // curV = newest minted version; queriedV = the OLD version read this step (drives the DAG pulse).
    return { pst, rng, n, versionCap, curV: 0, queriedV: 0, qResult: 0, atResult: 0, lastOp: 0, maxNs: 0, snap };
}
export function stepPersistentSegTreeWorld(w) {
    const p = w.pst, n = w.n;
    const r = nextU32(w.rng);
    // Mint a new version off a random EXISTING version; recycle when the version arena is full.
    // Public getters: p.versions (=_vcount), p.versionCapacity (=_vcap).
    if (p.versions > p.versionCapacity) { p.clear(); w.curV = 0; }
    const from = r % p.versions;
    const i = nextU32(w.rng) % n;
    const v = (nextU32(w.rng) & 255);
    w.curV = p.update(from, i, v);
    // Query an OLD version within the newest ~20 -- the window the demo draws -- so the queried
    // version highlights a VISIBLE dot in the chain and the highlight moves each frame. Still a
    // genuine read of a past, usually non-newest version (history provably live), just recent.
    const recent = p.versions < 20 ? p.versions : 20;
    const qv = (p.versions - 1 - (nextU32(w.rng) % recent)) | 0;
    const lo = nextU32(w.rng) % n; const hi = lo + (nextU32(w.rng) % (n - lo));
    w.queriedV = qv;
    w.qResult = p.query(qv, lo, hi);
    w.atResult = p.at(qv, lo);
    w.lastOp = 1;
}
export function snapshotPersistentSegTree(w, out) {
    const p = w.pst;
    out.val.set(p._val); out.left.set(p._left); out.right.set(p._right); out.roots.set(p._roots);
    out.next = p._next; out.vcount = p._vcount; out.vcap = p._vcap; out.budget = p._budget;
    out.n = p._n; out.k = p._k; out.idv = p._idv;
    return out.vcount;
}

// ---- MergeSortTree (STATIC/immutable, SQUARED-log axis) -------------------------------
export function createMergeSortTreeWorld(n) {
    const values = new Float64Array(n);
    const rng = makeRng(0x0a1b2c3d);
    for (let i = 0; i < n; i++) values[i] = nextKey(rng, 1 << 16);
    const mst = MergeSortTree.build(values);
    const snap = { t: new Float64Array(mst._cells), n: mst._n, h: mst._h, m: mst._m, cells: mst._cells };
    // `values` is the demo's OWN copy of the source-by-index (MST copied its own in), retained
    // ONLY as the render backdrop. Never mutated -> does not touch the copy-in immutability.
    // vlo/vhi are the live rangeCount value-window; x is the live countLE threshold.
    return { mst, rng, n, values, countRes: 0, rangeRes: 0, lastOp: 0, lo: 0, hi: 0, x: 0, vlo: 0, vhi: 0, maxNs: 0, snap };
}
export function stepMergeSortTreeWorld(w) {
    const m = w.mst, n = w.n;
    const r = nextU32(w.rng);
    const lo = r % n; const hi = lo + (nextU32(w.rng) % (n - lo));
    if (r & 1) {
        const x = nextKey(w.rng, 1 << 16);
        w.countRes = m.countLE(lo, hi, x); w.lo = lo; w.hi = hi; w.x = x; w.lastOp = 1; return;
    }
    const vlo = nextKey(w.rng, 1 << 15); const vhi = vlo + nextKey(w.rng, 1 << 15);
    w.rangeRes = m.rangeCount(lo, hi, vlo, vhi); w.lo = lo; w.hi = hi; w.vlo = vlo; w.vhi = vhi; w.lastOp = 2;
}
export function snapshotMergeSortTree(w, out) {
    const m = w.mst;
    out.t.set(m._t); out.n = m._n; out.h = m._h; out.m = m._m; out.cells = m._cells;
    return out.n;
}

// ---- Scene-04 naive FOILS -------------------------------------------------------------
/**
 * Copy-on-write history: a full O(n) array clone per version (the naive time-travel, and the
 * memory story -- clones grow linearly while the DAG shares subtrees). Allocates a fresh clone.
 * @returns {number} clone length (folded so the clone survives DCE)
 */
export function foilCopyOnWriteSnapshot(prev, i, value) {
    // FOIL: allocates ON PURPOSE -- this is the point (the DAG path-copies O(log n) instead).
    const clone = prev.slice();
    clone[i % clone.length] = value;
    return clone.length;
}
/**
 * Brute range-rank: an O(n) scan per range-count query (mirrors the MergeSortTree contract).
 * Allocates a fresh window slice each call.
 * @returns {number} count in [vlo, vhi]
 */
export function foilBruteRangeCount(values, lo, hi, vlo, vhi) {
    // FOIL: allocates ON PURPOSE -- this is the point.
    const window = values.slice(lo, hi + 1);
    let count = 0;
    for (let i = 0; i < window.length; i++) if (window[i] >= vlo && window[i] <= vhi) count++;
    return count;
}
