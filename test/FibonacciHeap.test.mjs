/**
 * @zakkster/lite-logn -- FibonacciHeap behavioral suite (node:test).
 *
 * The mergeable-heap arc's FINALE: the textbook-optimal ADDRESSABLE mergeable priority queue --
 * O(1)-amortized push/meld/decreaseKey (cascading cuts + a mark bit), O(log n)-amortized
 * popMin/remove (degree consolidation), over an arena-wide-unique id space. This suite proves the
 * heap-order contract (min AND max), the consolidation drains in sorted order, the addressable
 * decreaseKey/remove (incl. the cascading cut and the arena cross-heap owner guard), the O(1)
 * shared-arena meld + its consume-and-die contract (WALL-CLOCK independent of |donor|), and
 * free-list conservation. Honesty: this member is textbook-optimal but OFTEN slower wall-clock
 * than Pairing/Binary; correctness -- not speed -- is what this suite gates.
 */

import test from 'node:test';
import assert from 'node:assert/strict';
import { FibonacciHeap } from '../LogN.js';

// mulberry32 -- deterministic PRNG so fuzz cases replay identically.
function mulberry32(seed) {
    let s = seed >>> 0;
    return function () {
        s = (s + 0x6D2B79F5) | 0;
        let t = Math.imul(s ^ (s >>> 15), s | 1);
        t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
        return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
}

// --- construction + fail-closed validation ---------------------------------

test('constructor validates capacity + kind, freezes kind, exposes getters', () => {
    for (const bad of [0, -1, 1.5, NaN, Infinity, '8', null, undefined, Symbol('x'), 10n, 2 ** 31]) {
        assert.throws(() => new FibonacciHeap(bad), /\[lite-logn\]/);
    }
    for (const bad of ['biggest', 'MIN', '', null, 0, {}, Symbol('k'), 3n]) {
        assert.throws(() => new FibonacciHeap(8, bad), /\[lite-logn\]/);
    }
    assert.equal(new FibonacciHeap(8).kind, 'min');       // default
    const h = new FibonacciHeap(16, 'max');
    assert.equal(h.kind, 'max');
    assert.equal(h.capacity, 16);
    assert.equal(h.size, 0);
});

test('empty heap: peek/pop return undefined, never throw', () => {
    const h = new FibonacciHeap(4, 'min');
    assert.equal(h.peekMin(), undefined);
    assert.equal(h.peekMinKey(), undefined);
    assert.equal(h.popMin(), undefined);
    assert.equal(h.size, 0);
});

// --- push / popMin heap order (min AND max) vs a sorted reference -----------

for (const kind of ['min', 'max']) {
    test('push/popMin drains in ' + kind + ' order (fuzz vs sort)', () => {
        const n = 2000;
        const h = new FibonacciHeap(n, kind);
        const rnd = mulberry32(0xBEEF ^ (kind === 'min' ? 1 : 2));
        const keys = [];
        for (let i = 0; i < n; i++) { const k = rnd(); keys.push(k); h.push(i, k); }
        assert.equal(h.size, n);
        const expect = keys.slice().sort((a, b) => (kind === 'min' ? a - b : b - a));
        const out = [];
        while (h.size > 0) {
            const pk = h.peekMinKey();
            const id = h.popMin();
            assert.equal(pk, keys[id], 'peekMinKey matches the popped id key');
            out.push(keys[id]);
        }
        assert.deepEqual(out, expect, kind + ' drain order');
        assert.equal(h.size, 0);
    });
}

test('push fails closed: bad key (FIRST), bad id, duplicate id, full arena', () => {
    const h = new FibonacciHeap(4, 'min');
    for (const bad of [NaN, Infinity, -Infinity, '3', null, undefined, {}, Symbol('k'), 1n]) {
        assert.throws(() => h.push(0, bad), /\[lite-logn\]/);
    }
    for (const bad of [-1, 1.5, NaN, 4, 100, '0', null, Symbol('i'), 3n]) {
        assert.throws(() => h.push(bad, 1), /\[lite-logn\]/);
    }
    assert.equal(h.size, 0);
    h.push(0, 1);
    assert.throws(() => h.push(0, 9), /\[lite-logn\]/); // duplicate live id
    h.push(1, 2); h.push(2, 3); h.push(3, 4);           // fill to capacity (ids 0..3)
    assert.equal(h.size, 4);
    // capacity is the id domain: id 4 is out of range (also, arena is full)
    assert.throws(() => h.push(4, 5), /\[lite-logn\]/);
});

// --- decreaseKey (addressable) ---------------------------------------------

test('decreaseKey moves an id toward the min extreme (root + interior)', () => {
    const h = new FibonacciHeap(100, 'min');
    for (let i = 0; i < 100; i++) h.push(i, 1000 + i);
    h.popMin(); // consolidate so nodes acquire real parents (interior decreaseKey exercises the cut)
    h.decreaseKey(50, -5);
    assert.equal(h.peekMin(), 50);
    assert.equal(h.keyOf(50), -5);
    h.decreaseKey(99, -10);
    assert.equal(h.peekMin(), 99);
    // decreasing the current extreme is a no-op on structure, still valid
    h.decreaseKey(99, -20);
    assert.equal(h.peekMin(), 99);
    assert.equal(h.keyOf(99), -20);
});

test('decreaseKey toward the MAX extreme (a max heap increases)', () => {
    const h = new FibonacciHeap(50, 'max');
    for (let i = 0; i < 50; i++) h.push(i, i);
    h.decreaseKey(3, 999);           // "toward the extreme" == increase for a max heap
    assert.equal(h.peekMin(), 3);    // peekMin returns the extreme id (max here)
    assert.equal(h.peekMinKey(), 999);
});

test('decreaseKey fails closed: away from extreme, non-member, bad key/id', () => {
    const h = new FibonacciHeap(16, 'min');
    for (let i = 0; i < 8; i++) h.push(i, 100 + i);
    assert.throws(() => h.decreaseKey(0, 999), /TOWARD/i);   // min: increase rejected
    assert.throws(() => h.decreaseKey(12, 1), /\[lite-logn\]/); // non-member
    for (const bad of [NaN, Infinity, '3', null, {}, Symbol('k'), 1n]) {
        assert.throws(() => h.decreaseKey(0, bad), /\[lite-logn\]/);
    }
    for (const bad of [-1, 16, 1.5, NaN, Symbol('i'), 3n]) {
        assert.throws(() => h.decreaseKey(bad, 1), /\[lite-logn\]/);
    }
});

test('decreaseKey then drain yields the corrected order (fuzz, consolidated forest)', () => {
    const n = 500;
    const h = new FibonacciHeap(n, 'min');
    const rnd = mulberry32(0x1357);
    const key = new Float64Array(n);
    for (let i = 0; i < n; i++) { key[i] = 100 + rnd() * 100; h.push(i, key[i]); }
    // pop a chunk to consolidate the lazy root list into deep trees (so cuts + cascades fire)
    for (let i = 0; i < 100; i++) { const id = h.popMin(); key[id] = Infinity; }
    // decrease a random third of the SURVIVING ids to fresh smaller values
    for (let t = 0; t < n; t += 3) {
        if (key[t] === Infinity) continue;
        const nk = rnd() * 50; key[t] = nk; h.decreaseKey(t, nk);
    }
    let prev = -Infinity, count = 0;
    while (h.size > 0) { const id = h.popMin(); assert.ok(key[id] >= prev - 1e-9); prev = key[id]; count++; }
    assert.equal(count, 400);
});

// --- cascading cut: the Fibonacci-specific decreaseKey mechanic -------------

test('cascading cut: a chain of decreaseKeys cuts marked ancestors to the root list', () => {
    // Build a deterministic deep tree via a consolidation, then drive decreaseKeys that mark and
    // then cut parents. We do not assert the internal marks directly here (that is the boundary
    // suite); we assert the OBSERVABLE contract: after any cascade the heap still drains sorted and
    // every id survives exactly once, and the min is always correct.
    const n = 64;
    const h = new FibonacciHeap(n, 'min');
    for (let i = 0; i < n; i++) h.push(i, i);
    h.popMin(); // id 0 out; consolidation builds a binomial-like forest with real depth
    const key = new Map();
    for (let i = 1; i < n; i++) key.set(i, i);
    // repeatedly decrease the deepest-keyed ids just below the current min -> forces cuts + cascades
    const rnd = mulberry32(0x5EED);
    for (let step = 0; step < 200; step++) {
        const id = 1 + ((rnd() * (n - 1)) | 0);
        if (!key.has(id)) continue;
        const min = h.peekMinKey();
        const nk = min - 1 - rnd() * 3;
        h.decreaseKey(id, nk); key.set(id, nk);
        assert.equal(h.keyOf(id), nk);
        assert.equal(h.peekMin(), id, 'the just-decreased id is now the extreme');
    }
    // drain: sorted + every surviving id exactly once
    let prev = -Infinity, seen = new Set();
    while (h.size > 0) { const id = h.popMin(); assert.ok(key.get(id) >= prev - 1e-9); prev = key.get(id); seen.add(id); }
    assert.equal(seen.size, key.size);
});

// --- remove (addressable) --------------------------------------------------

test('remove: present -> true, absent -> false, root + interior + with children', () => {
    const h = new FibonacciHeap(64, 'min');
    for (let i = 0; i < 64; i++) h.push(i, i);
    h.popMin(); // removes id 0 (the min), consolidates into a real forest
    assert.equal(h.remove(1), true);          // remove the (likely) new extreme
    assert.equal(h.has(1), false);
    assert.equal(h.remove(1), false);         // already gone
    assert.equal(h.remove(40), true);         // remove an interior node with children
    assert.equal(h.has(40), false);
    assert.equal(h.remove(100 & 63), true);   // 100&63 = 36
    const seen = new Set();
    while (h.size > 0) seen.add(h.popMin());
    for (const gone of [0, 1, 40, 36]) assert.ok(!seen.has(gone), gone + ' must not resurface');
});

test('remove fails closed on out-of-range id; absent returns false', () => {
    const h = new FibonacciHeap(8, 'min');
    for (const bad of [-1, 8, 1.5, NaN, Symbol('i'), 3n]) {
        assert.throws(() => h.remove(bad), /\[lite-logn\]/);
    }
    assert.equal(h.remove(3), false); // in range, absent
});

// --- has / keyOf -----------------------------------------------------------

test('has / keyOf reflect membership; out-of-range throws', () => {
    const h = new FibonacciHeap(8, 'min');
    h.push(2, 4.5);
    assert.equal(h.has(2), true);
    assert.equal(h.keyOf(2), 4.5);
    assert.equal(h.has(3), false);
    assert.equal(h.keyOf(3), undefined);
    for (const bad of [-1, 8, 1.5, NaN, Symbol('i'), 3n]) {
        assert.throws(() => h.has(bad), /\[lite-logn\]/);
        assert.throws(() => h.keyOf(bad), /\[lite-logn\]/);
    }
});

// --- arena: shared pool, arena-wide-unique ids, cross-heap owner guard ------

test('arena factory validates count; hands out arena-sharing empty heaps', () => {
    for (const bad of [0, -1, 1.5, NaN, '2', null, undefined, {}, Symbol('c'), 2n]) {
        assert.throws(() => FibonacciHeap.arena(8, 'min', bad), /\[lite-logn\]/);
    }
    assert.throws(() => FibonacciHeap.arena(0, 'min', 2), /\[lite-logn\]/);
    assert.throws(() => FibonacciHeap.arena(8, 'bad', 2), /\[lite-logn\]/);
    const heaps = FibonacciHeap.arena(16, 'min', 3);
    assert.equal(heaps.length, 3);
    for (const h of heaps) { assert.equal(h.size, 0); assert.equal(h.kind, 'min'); assert.equal(h.capacity, 16); }
});

test('ARENA-WIDE-UNIQUE ids: an id live in a sibling cannot be pushed; owner guard on decreaseKey/remove', () => {
    const [a, b] = FibonacciHeap.arena(32, 'min', 2);
    for (let k = 0; k < 8; k++) a.push(k, 100 + k);
    for (let k = 8; k < 16; k++) b.push(k, 100 + k);
    assert.throws(() => a.push(10, 1), /unique arena-wide/);          // 10 is b's
    assert.throws(() => a.decreaseKey(10, 1), /different live heap/); // cross-heap
    assert.throws(() => a.remove(10), /different live heap/);
    assert.equal(a.has(10), false);           // sibling id is not this heap's member
    assert.equal(a.keyOf(10), undefined);
    // b can still operate on its own id
    b.decreaseKey(10, -1);
    assert.equal(b.peekMin(), 10);
});

// --- meld: O(1), consume-and-die, addressability of melded-in ids ----------

test('meld folds every node, CONSUMES the donor (dead), preserves order', () => {
    const [a, b] = FibonacciHeap.arena(64, 'min', 2);
    for (let k = 0; k < 20; k++) a.push(k, 100 - k);
    for (let k = 20; k < 40; k++) b.push(k, 100 - k);
    const ret = a.meld(b);
    assert.equal(ret, a, 'meld returns this');
    assert.equal(b.size, 0, 'donor emptied');
    assert.equal(a.size, 40, 'melder holds every node');
    // donor is DEAD: every op throws
    for (const op of [() => b.push(1, 1), () => b.popMin(), () => b.peekMin(),
        () => b.decreaseKey(20, 1), () => b.remove(20), () => b.clear(),
        () => b.forEach(() => {}), () => [...b], () => a.meld(b)]) {
        assert.throws(op, /\[lite-logn\]/);
    }
    // drain a: strictly ascending keys, every id present exactly once
    let prev = -Infinity, count = 0; const seen = new Set();
    while (a.size > 0) { const id = a.popMin(); const k = 100 - id; assert.ok(k >= prev); prev = k; seen.add(id); count++; }
    assert.equal(count, 40);
    assert.equal(seen.size, 40);
});

test('a melded-in id is reprioritizable via the surviving heap, across TWO meld hops', () => {
    const [a, b, c] = FibonacciHeap.arena(96, 'min', 3);
    for (let k = 0; k < 10; k++) a.push(k, 100 + k);
    for (let k = 10; k < 20; k++) b.push(k, 100 + k);
    for (let k = 20; k < 30; k++) c.push(k, 100 + k);
    a.meld(b);   // hop 1: b's ids resolve to a
    a.meld(c);   // hop 2: c's ids resolve to a (through the alias chain)
    assert.equal(a.size, 30);
    // ids from BOTH melded-in heaps are addressable through the survivor
    assert.equal(a.has(15), true);            // from b
    assert.equal(a.has(25), true);            // from c
    a.decreaseKey(25, -1);
    assert.equal(a.peekMin(), 25, 'a twice-melded-in id reaches the extreme');
    assert.equal(a.remove(15), true);         // and a once-melded-in id is removable
    assert.equal(a.has(15), false);
});

test('meld fails closed: non-FibonacciHeap, self, cross-arena, kind mismatch, consumed', () => {
    const [a, b] = FibonacciHeap.arena(16, 'min', 2);
    assert.throws(() => a.meld({}), /\[lite-logn\]/);
    assert.throws(() => a.meld(a), /\[lite-logn\]/);
    assert.throws(() => a.meld(new FibonacciHeap(16, 'min')), /\[lite-logn\]/); // cross-arena
    const [maxA] = FibonacciHeap.arena(16, 'max', 1);
    assert.throws(() => a.meld(maxA), /\[lite-logn\]/); // kind mismatch (also cross-arena)
    a.meld(b);
    assert.throws(() => a.meld(b), /\[lite-logn\]/);    // b already consumed
});

test('meld is O(1): work does NOT scale with the donor size (pool untouched)', () => {
    // Instrument NodePool.alloc/free to count pool operations during meld. An O(|b|) migration
    // would allocate/free per node; an O(1) meld touches the pool ZERO times. This is the same
    // wall-clock-independent-of-|donor| guarantee the PairingHeap meld proved.
    const [a, b] = FibonacciHeap.arena(100000, 'min', 2);
    for (let k = 0; k < 10; k++) a.push(k, k);
    for (let k = 10; k < 90000; k++) b.push(k, k); // a LARGE donor
    const pool = a._pool;
    let allocs = 0, frees = 0;
    const origAlloc = pool.alloc.bind(pool), origFree = pool.free.bind(pool);
    pool.alloc = (...args) => { allocs++; return origAlloc(...args); };
    pool.free = (...args) => { frees++; return origFree(...args); };
    const active = pool.activeSlots;
    a.meld(b);
    pool.alloc = origAlloc; pool.free = origFree;
    assert.equal(allocs, 0, 'meld must not alloc a slot (O(1), independent of |b|)');
    assert.equal(frees, 0, 'meld must not free a slot (O(1), independent of |b|)');
    assert.equal(pool.activeSlots, active, 'active slot count unchanged by meld');
    assert.equal(a.size, 90000);
});

// --- clear + free-list conservation ----------------------------------------

test('clear empties only this heap; sibling arena nodes untouched; reusable', () => {
    const [a, b] = FibonacciHeap.arena(64, 'min', 2);
    for (let k = 0; k < 20; k++) a.push(k, k);
    for (let k = 20; k < 40; k++) b.push(k, k);
    a.clear();
    assert.equal(a.size, 0);
    assert.equal(b.size, 20, 'sibling untouched');
    // ids freed by a can be reused; b keeps its ids
    for (let k = 0; k < 20; k++) a.push(k, k * 2);
    assert.equal(a.size, 20);
    assert.equal(a.peekMin(), 0);
});

test('clear frees a CONSOLIDATED forest (deep trees) back to the pool', () => {
    const h = new FibonacciHeap(128, 'min');
    for (let i = 0; i < 128; i++) h.push(i, (i * 2654435761) & 0xffff);
    for (let i = 0; i < 40; i++) h.popMin(); // consolidate into deep trees + free some
    const before = h._pool.activeSlots;
    assert.ok(before > 0);
    h.clear();
    assert.equal(h.size, 0);
    assert.equal(h._pool.activeSlots, 0, 'clear returned every own node');
    assert.equal(h._pool.activeSlots + h._pool.freeListLength, h._pool.capacity);
});

test('free-list conservation across 1e4 push/popMin cycles (activeSlots -> 0)', () => {
    const h = new FibonacciHeap(64, 'min');
    for (let cyc = 0; cyc < 10000; cyc++) {
        for (let i = 0; i < 64; i++) h.push(i, (i * 2654435761) & 0xffff);
        while (h.size > 0) h.popMin();
        assert.equal(h._pool.activeSlots, 0);
        assert.equal(h._pool.activeSlots + h._pool.freeListLength, h._pool.capacity);
    }
});

test('conservation holds across meld (nodes move root lists, not pools)', () => {
    const [a, b] = FibonacciHeap.arena(256, 'min', 2);
    for (let i = 0; i < 100; i++) a.push(i, (i * 40503) & 0xffff);
    for (let i = 100; i < 200; i++) b.push(i, (i * 2654435761) & 0xffff);
    const before = a._pool.activeSlots;
    assert.equal(before, 200);
    a.meld(b);
    assert.equal(a._pool.activeSlots, before, 'no pool churn on meld');
    assert.equal(a.size, 200);
    assert.equal(b.size, 0);
    let drained = 0; while (a.size > 0) { a.popMin(); drained++; }
    assert.equal(drained, 200);
    assert.equal(a._pool.activeSlots, 0);
    assert.equal(a._pool.activeSlots + a._pool.freeListLength, a._pool.capacity);
});

// --- forEach / iterator ----------------------------------------------------

test('forEach + [Symbol.iterator] visit every live id (unspecified order)', () => {
    const h = new FibonacciHeap(32, 'min');
    for (let i = 0; i < 16; i++) h.push(i, 16 - i);
    h.popMin(); // build a real forest
    const fe = new Set();
    h.forEach((id) => fe.add(id));
    const it = new Set([...h]);
    assert.deepEqual([...fe].sort((a, b) => a - b), [...it].sort((a, b) => a - b));
    assert.equal(fe.size, h.size);
    // every live id is exactly the ones not yet popped
    const drained = new Set(); while (h.size > 0) drained.add(h.popMin());
    assert.deepEqual([...fe].sort((a, b) => a - b), [...drained].sort((a, b) => a - b));
});

// --- addressable churn fuzz vs a Map oracle (min AND max) -------------------

for (const kind of ['min', 'max']) {
    test('addressable churn fuzz (' + kind + '): state stays consistent vs a Map oracle', () => {
        const n = 200;
        const better = kind === 'min' ? (a, b) => a < b : (a, b) => a > b;
        const h = new FibonacciHeap(n, kind);
        const key = new Map(); // id -> current key, our model
        const rnd = mulberry32(0x99C3 ^ (kind === 'min' ? 0 : 1));
        for (let step = 0; step < 20000; step++) {
            const id = (rnd() * n) | 0;
            const r = rnd();
            if (key.has(id)) {
                if (r < 0.4) { // decreaseKey TOWARD the extreme
                    const cur = key.get(id);
                    const nk = kind === 'min' ? cur - 1 - rnd() * 5 : cur + 1 + rnd() * 5;
                    h.decreaseKey(id, nk); key.set(id, nk);
                    assert.equal(h.keyOf(id), nk);
                } else if (r < 0.7) { // remove
                    assert.equal(h.remove(id), true); key.delete(id);
                    assert.equal(h.has(id), false);
                }
            } else if (r < 0.7) { // push
                const nk = rnd() * 1000;
                h.push(id, nk); key.set(id, nk);
                assert.equal(h.keyOf(id), nk);
            }
            assert.equal(h.size, key.size);
            if (key.size > 0) {
                let ext = null;
                for (const v of key.values()) if (ext === null || better(v, ext)) ext = v;
                assert.equal(h.peekMinKey(), ext, 'peekMinKey tracks the model extreme at step ' + step);
                assert.equal(key.get(h.peekMin()), ext);
            }
        }
        // final drain matches the model in extreme-first order
        const modelSorted = [...key.values()].sort((a, b) => (kind === 'min' ? a - b : b - a));
        const out = [];
        while (h.size > 0) out.push(key.get(h.popMin()));
        assert.deepEqual(out, modelSorted);
    });
}
