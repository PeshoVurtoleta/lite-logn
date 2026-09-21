/**
 * @zakkster/lite-logn -- PairingHeap behavioral suite (node:test).
 *
 * The mergeable-heap arc's ADDRESSABLE member: an O(1) push/meld, amortized O(log n)
 * popMin/decreaseKey/remove, over an arena-wide-unique id space. This suite proves the
 * heap-order contract (min AND max), the two-pass combine drains in sorted order, the
 * addressable decreaseKey/remove (incl. the arena cross-heap owner guard), the O(1)
 * shared-arena meld + its consume-and-die contract, and free-list conservation.
 */

import test from 'node:test';
import assert from 'node:assert/strict';
import { PairingHeap } from '../LogN.js';

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
        assert.throws(() => new PairingHeap(bad), /\[lite-logn\]/);
    }
    for (const bad of ['biggest', 'MIN', '', null, 0, {}, Symbol('k'), 3n]) {
        assert.throws(() => new PairingHeap(8, bad), /\[lite-logn\]/);
    }
    assert.equal(new PairingHeap(8).kind, 'min');       // default
    const h = new PairingHeap(16, 'max');
    assert.equal(h.kind, 'max');
    assert.equal(h.capacity, 16);
    assert.equal(h.size, 0);
});

test('empty heap: peek/pop return undefined, never throw', () => {
    const h = new PairingHeap(4, 'min');
    assert.equal(h.peekMin(), undefined);
    assert.equal(h.peekMinKey(), undefined);
    assert.equal(h.popMin(), undefined);
    assert.equal(h.size, 0);
});

// --- push / popMin heap order (min AND max) vs a sorted reference -----------

for (const kind of ['min', 'max']) {
    test('push/popMin drains in ' + kind + ' order (fuzz vs sort)', () => {
        const n = 2000;
        const h = new PairingHeap(n, kind);
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
    const h = new PairingHeap(4, 'min');
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
    const h = new PairingHeap(100, 'min');
    for (let i = 0; i < 100; i++) h.push(i, 1000 + i);
    h.decreaseKey(50, -5);
    assert.equal(h.peekMin(), 50);
    assert.equal(h.keyOf(50), -5);
    h.decreaseKey(99, -10);
    assert.equal(h.peekMin(), 99);
    // decreasing the current root is a no-op on structure, still valid
    h.decreaseKey(99, -20);
    assert.equal(h.peekMin(), 99);
    assert.equal(h.keyOf(99), -20);
});

test('decreaseKey toward the MAX extreme (a max heap increases)', () => {
    const h = new PairingHeap(50, 'max');
    for (let i = 0; i < 50; i++) h.push(i, i);
    h.decreaseKey(3, 999);           // "toward the extreme" == increase for a max heap
    assert.equal(h.peekMin(), 3);    // peekMin returns the extreme id (max here)
    assert.equal(h.peekMinKey(), 999);
});

test('decreaseKey fails closed: away from extreme, non-member, bad key/id', () => {
    const h = new PairingHeap(16, 'min');
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

test('decreaseKey then drain yields the corrected order (fuzz)', () => {
    const n = 500;
    const h = new PairingHeap(n, 'min');
    const rnd = mulberry32(0x1357);
    const key = new Float64Array(n);
    for (let i = 0; i < n; i++) { key[i] = 100 + rnd() * 100; h.push(i, key[i]); }
    // decrease a random third of the ids to fresh smaller values
    for (let t = 0; t < n; t += 3) { const nk = rnd() * 50; key[t] = nk; h.decreaseKey(t, nk); }
    let prev = -Infinity, count = 0;
    while (h.size > 0) { const id = h.popMin(); assert.ok(key[id] >= prev - 1e-9); prev = key[id]; count++; }
    assert.equal(count, n);
});

// --- remove (addressable) --------------------------------------------------

test('remove: present -> true, absent -> false, root + interior + with children', () => {
    const h = new PairingHeap(64, 'min');
    for (let i = 0; i < 64; i++) h.push(i, i);
    // force a real multi-child structure: pop once so the two-pass builds a tree
    h.popMin(); // removes id 0 (the min), combines children
    assert.equal(h.remove(1), true);          // remove the (likely) new root
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
    const h = new PairingHeap(8, 'min');
    for (const bad of [-1, 8, 1.5, NaN, Symbol('i'), 3n]) {
        assert.throws(() => h.remove(bad), /\[lite-logn\]/);
    }
    assert.equal(h.remove(3), false); // in range, absent
});

// --- has / keyOf -----------------------------------------------------------

test('has / keyOf reflect membership; out-of-range throws', () => {
    const h = new PairingHeap(8, 'min');
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
        assert.throws(() => PairingHeap.arena(8, 'min', bad), /\[lite-logn\]/);
    }
    assert.throws(() => PairingHeap.arena(0, 'min', 2), /\[lite-logn\]/);
    assert.throws(() => PairingHeap.arena(8, 'bad', 2), /\[lite-logn\]/);
    const heaps = PairingHeap.arena(16, 'min', 3);
    assert.equal(heaps.length, 3);
    for (const h of heaps) { assert.equal(h.size, 0); assert.equal(h.kind, 'min'); assert.equal(h.capacity, 16); }
});

test('ARENA-WIDE-UNIQUE ids: an id live in a sibling cannot be pushed; owner guard on decreaseKey/remove', () => {
    const [a, b] = PairingHeap.arena(32, 'min', 2);
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
    const [a, b] = PairingHeap.arena(64, 'min', 2);
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

test('a melded-in id is reprioritizable via the surviving heap (addressable meld)', () => {
    const [a, b] = PairingHeap.arena(64, 'min', 2);
    for (let k = 0; k < 10; k++) a.push(k, 100 + k);
    for (let k = 10; k < 20; k++) b.push(k, 100 + k);
    a.meld(b);
    assert.equal(a.has(15), true);            // 15 came from b, now a's
    a.decreaseKey(15, -1);
    assert.equal(a.peekMin(), 15);
    assert.equal(a.remove(12), true);         // and removable
    assert.equal(a.has(12), false);
});

test('meld fails closed: non-PairingHeap, self, cross-arena, kind mismatch, consumed', () => {
    const [a, b] = PairingHeap.arena(16, 'min', 2);
    assert.throws(() => a.meld({}), /\[lite-logn\]/);
    assert.throws(() => a.meld(a), /\[lite-logn\]/);
    assert.throws(() => a.meld(new PairingHeap(16, 'min')), /\[lite-logn\]/); // cross-arena
    const [maxA] = PairingHeap.arena(16, 'max', 1);
    assert.throws(() => a.meld(maxA), /\[lite-logn\]/); // kind mismatch (also cross-arena)
    a.meld(b);
    assert.throws(() => a.meld(b), /\[lite-logn\]/);    // b already consumed
});

test('meld is O(1): work does NOT scale with the donor size', () => {
    // Instrument NodePool.alloc/free to count pool operations during meld. An O(|b|)
    // migration would allocate/free per node; an O(1) meld touches the pool ZERO times.
    const [a, b] = PairingHeap.arena(100000, 'min', 2);
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
    const [a, b] = PairingHeap.arena(64, 'min', 2);
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

test('free-list conservation across 1e4 push/popMin cycles (activeSlots -> 0)', () => {
    const h = new PairingHeap(64, 'min');
    for (let cyc = 0; cyc < 10000; cyc++) {
        for (let i = 0; i < 64; i++) h.push(i, (i * 2654435761) & 0xffff);
        while (h.size > 0) h.popMin();
        assert.equal(h._pool.activeSlots, 0);
        assert.equal(h._pool.activeSlots + h._pool.freeListLength, h._pool.capacity);
    }
});

test('conservation holds across meld (nodes move root lists, not pools)', () => {
    const [a, b] = PairingHeap.arena(256, 'min', 2);
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
    const h = new PairingHeap(32, 'min');
    for (let i = 0; i < 16; i++) h.push(i, 16 - i);
    h.popMin(); // build a real tree
    const fe = new Set();
    h.forEach((id) => fe.add(id));
    const it = new Set([...h]);
    assert.deepEqual([...fe].sort((a, b) => a - b), [...it].sort((a, b) => a - b));
    assert.equal(fe.size, h.size);
    // every live id is exactly the ones not yet popped
    const drained = new Set(); while (h.size > 0) drained.add(h.popMin());
    assert.deepEqual([...fe].sort((a, b) => a - b), [...drained].sort((a, b) => a - b));
});

// --- addressable churn fuzz (decreaseKey + remove + re-push) ----------------

test('addressable churn fuzz: state stays consistent (model check)', () => {
    const n = 200;
    const h = new PairingHeap(n, 'min');
    const key = new Map(); // id -> current key, our model
    const rnd = mulberry32(0x99C3);
    for (let step = 0; step < 20000; step++) {
        const id = (rnd() * n) | 0;
        const r = rnd();
        if (key.has(id)) {
            if (r < 0.4) { // decreaseKey toward min
                const nk = key.get(id) - 1 - rnd() * 5;
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
            let min = Infinity, minId = -1;
            for (const [k, v] of key) if (v < min) { min = v; minId = k; }
            assert.equal(h.peekMinKey(), min, 'peekMinKey tracks the model min at step ' + step);
            assert.equal(key.get(h.peekMin()), min);
            void minId;
        }
    }
    // final drain matches the model in sorted order
    const modelSorted = [...key.values()].sort((a, b) => a - b);
    const out = [];
    while (h.size > 0) out.push(key.get(h.popMin()));
    assert.deepEqual(out, modelSorted);
});
