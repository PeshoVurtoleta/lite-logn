/**
 * @zakkster/lite-logn -- BinomialHeap behavioral + meld/arena suite.
 *
 * The ninth member's contract, proven at the doors and against a brute-force model:
 *   - construction validation (bad capacity / kind); kind frozen at ctor;
 *   - push / popMin ordering for BOTH min and max; peekMin / peekMinKey;
 *   - a drain-sorted ORACLE after >= 1e5 mixed push/popMin ops vs a sorted model;
 *   - popped id multiset === pushed (opaque ids, dupes allowed);
 *   - meld correctness: melded drain === the union of both heaps, sorted;
 *   - shared-arena factory: count heaps share one pool; cross-arena is caught;
 *   - meld CONSUMES the donor: it is empty (size 0) AND dead (every op throws);
 *   - conservation across meld (activeSlots unchanged; full drain returns every slot);
 *   - fail-closed doors (capacity / kind / key / id / full / self / kind-mismatch);
 *   - empty peek/pop return undefined (never throw);
 *   - forEach / iterator yield the full id multiset (unspecified order);
 *   - the LEAN surface (no decreaseKey / remove / changeKey / rank / select).
 */

import test from 'node:test';
import assert from 'node:assert/strict';
import { BinomialHeap } from '../LogN.js';

// mulberry32 -- deterministic PRNG so every fuzz run is reproducible.
function mulberry32(seed) {
    let s = seed >>> 0;
    return function () {
        s = (s + 0x6D2B79F5) | 0;
        let t = Math.imul(s ^ (s >>> 15), s | 1);
        t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
        return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
}

// --- construction -----------------------------------------------------------

test('construction: bad capacity / kind fail closed; kind frozen at ctor', () => {
    for (const bad of [0, -1, 1.5, NaN, Infinity, '8', null, undefined, Symbol('x'), 10n, 2 ** 31]) {
        assert.throws(() => new BinomialHeap(bad), /\[lite-logn\]/, 'capacity ' + String(bad));
    }
    for (const bad of ['biggest', 'MIN', '', null, 0, Symbol('k'), {}]) {
        assert.throws(() => new BinomialHeap(8, bad), /\[lite-logn\]/, 'kind ' + String(bad));
    }
    assert.equal(new BinomialHeap(8).kind, 'min');       // default
    assert.equal(new BinomialHeap(8, 'min').kind, 'min');
    assert.equal(new BinomialHeap(8, 'max').kind, 'max');
    const h = new BinomialHeap(8, 'max');
    assert.equal(h.size, 0);
    assert.equal(h.capacity, 8);
});

// --- basic push / popMin / peek for min and max -----------------------------

test('push/popMin drains sorted for min and max; peekMin/peekMinKey track the extreme', () => {
    for (const kind of ['min', 'max']) {
        const n = 500;
        const h = new BinomialHeap(n, kind);
        const rnd = mulberry32(0xBEEF ^ (kind === 'min' ? 1 : 2));
        const keys = [];
        for (let i = 0; i < n; i++) { const v = (rnd() * 1e6) | 0; keys.push(v); h.push(i, v); }
        assert.equal(h.size, n);
        // peek matches the model extreme before each pop
        const model = keys.slice().sort((a, b) => (kind === 'min' ? a - b : b - a));
        for (let i = 0; i < n; i++) {
            assert.equal(h.peekMinKey(), model[i], kind + ' peekMinKey step ' + i);
            assert.equal(typeof h.peekMin(), 'number');
            h.popMin();
        }
        assert.equal(h.size, 0);
        assert.equal(h.peekMin(), undefined);
        assert.equal(h.peekMinKey(), undefined);
        assert.equal(h.popMin(), undefined);
    }
});

// --- oracle fuzz: mixed push/popMin vs a sorted model -----------------------

test('oracle: >= 1e5 mixed push/popMin ops track a sorted multiset model (min + max)', () => {
    for (const kind of ['min', 'max']) {
        const CAP = 4096;
        const h = new BinomialHeap(CAP, kind);
        const model = []; // sorted ascending; the extreme is the front (min) or back (max)
        const rnd = mulberry32(0x1234abcd ^ (kind === 'min' ? 7 : 11));
        let ops = 0;
        const extremeOf = () => model.length === 0 ? undefined : (kind === 'min' ? model[0] : model[model.length - 1]);
        while (ops < 100000) {
            const doPush = model.length === 0 || (model.length < CAP && rnd() < 0.55);
            if (doPush) {
                const key = (rnd() * 1e6) | 0;
                h.push(ops & 0xffff, key);
                // insert into sorted model
                let lo = 0, hi = model.length;
                while (lo < hi) { const mid = (lo + hi) >> 1; if (model[mid] < key) lo = mid + 1; else hi = mid; }
                model.splice(lo, 0, key);
            } else {
                assert.equal(h.peekMinKey(), extremeOf(), kind + ' peek mismatch at op ' + ops);
                h.popMin();
                if (kind === 'min') model.shift(); else model.pop();
            }
            assert.equal(h.size, model.length, kind + ' size drift at op ' + ops);
            ops++;
        }
        // drain the rest sorted
        while (model.length > 0) {
            assert.equal(h.peekMinKey(), extremeOf());
            h.popMin();
            if (kind === 'min') model.shift(); else model.pop();
        }
        assert.equal(h.size, 0);
    }
});

// --- opaque id multiset conservation (dupes allowed) ------------------------

test('popped id multiset === pushed id multiset (opaque ids, duplicates allowed)', () => {
    const n = 2000;
    const h = new BinomialHeap(n, 'min');
    const rnd = mulberry32(0x55aa55aa);
    const pushed = new Map();
    for (let i = 0; i < n; i++) {
        const id = (rnd() * 16) | 0; // deliberate duplicates in [0,16)
        const key = (rnd() * 1e6) | 0;
        h.push(id, key);
        pushed.set(id, (pushed.get(id) || 0) + 1);
    }
    const popped = new Map();
    while (h.size > 0) { const id = h.popMin(); popped.set(id, (popped.get(id) || 0) + 1); }
    assert.deepEqual(popped, pushed);
});

// --- meld correctness -------------------------------------------------------

test('meld: melded drain === union of both heaps sorted (min + max); consumes the donor', () => {
    for (const kind of ['min', 'max']) {
        const [a, b] = BinomialHeap.arena(2000, kind, 2);
        const rnd = mulberry32(0xC0FFEE ^ (kind === 'min' ? 3 : 5));
        const all = [];
        for (let i = 0; i < 700; i++) { const v = (rnd() * 1e6) | 0; a.push(i, v); all.push(v); }
        for (let i = 0; i < 500; i++) { const v = (rnd() * 1e6) | 0; b.push(1000 + i, v); all.push(v); }
        const na = a.size, nb = b.size;
        const ret = a.meld(b);
        assert.equal(ret, a, 'meld returns the melded heap (this)');
        assert.equal(a.size, na + nb);
        assert.equal(b.size, 0, 'donor consumed to empty');
        const model = all.sort((x, y) => (kind === 'min' ? x - y : y - x));
        for (let i = 0; i < model.length; i++) {
            assert.equal(a.peekMinKey(), model[i], kind + ' melded order step ' + i);
            a.popMin();
        }
        assert.equal(a.size, 0);
    }
});

test('meld cascade over an arena of many heaps preserves the full multiset', () => {
    const K = 6;
    const heaps = BinomialHeap.arena(5000, 'min', K);
    const rnd = mulberry32(0x99887766);
    const all = [];
    for (let h = 0; h < K; h++) {
        const cnt = 200 + ((rnd() * 300) | 0);
        for (let i = 0; i < cnt; i++) { const v = (rnd() * 1e6) | 0; heaps[h].push(i & 0xffff, v); all.push(v); }
    }
    // cascade-meld everything into heaps[0]
    for (let h = 1; h < K; h++) heaps[0].meld(heaps[h]);
    assert.equal(heaps[0].size, all.length);
    const model = all.sort((x, y) => x - y);
    const out = [];
    while (heaps[0].size > 0) { out.push(heaps[0].peekMinKey()); heaps[0].popMin(); }
    assert.deepEqual(out, model);
});

// --- shared-arena factory + consume-fails-closed ----------------------------

test('arena: count heaps share ONE pool; standalone heaps do NOT', () => {
    const [a, b, c] = BinomialHeap.arena(64, 'min', 3);
    assert.equal(a._pool, b._pool, 'arena siblings share the pool');
    assert.equal(a._key, c._key, 'arena siblings share the columns');
    const s1 = new BinomialHeap(64, 'min');
    const s2 = new BinomialHeap(64, 'min');
    assert.notEqual(s1._key, s2._key, 'standalone heaps own separate arenas');
    // bad count fails closed
    for (const bad of [0, -1, 1.5, NaN, '2', null, undefined, {}, Symbol('c')]) {
        assert.throws(() => BinomialHeap.arena(8, 'min', bad), /\[lite-logn\]/, 'count ' + String(bad));
    }
});

test('meld fail-closed doors: non-heap, self, cross-arena, kind mismatch, consumed', () => {
    const [a, b] = BinomialHeap.arena(64, 'min', 2);
    assert.throws(() => a.meld({}), /\[lite-logn\]/, 'non-BinomialHeap');
    assert.throws(() => a.meld(a), /\[lite-logn\]/, 'self-meld');
    const other = new BinomialHeap(64, 'min');
    assert.throws(() => a.meld(other), /\[lite-logn\]/, 'cross-arena (column identity)');
    const [maxA] = BinomialHeap.arena(64, 'max', 1);
    assert.throws(() => a.meld(maxA), /\[lite-logn\]/, 'kind mismatch');
    // consume: after meld, the donor is DEAD -- every op fails closed
    for (let k = 0; k < 10; k++) { a.push(k, k); b.push(k + 10, k + 10); }
    a.meld(b);
    assert.equal(b.size, 0);
    assert.throws(() => b.push(1, 1), /\[lite-logn\]/, 'consumed push');
    assert.throws(() => b.popMin(), /\[lite-logn\]/, 'consumed popMin');
    assert.throws(() => b.peekMin(), /\[lite-logn\]/, 'consumed peekMin');
    assert.throws(() => b.peekMinKey(), /\[lite-logn\]/, 'consumed peekMinKey');
    assert.throws(() => b.clear(), /\[lite-logn\]/, 'consumed clear');
    assert.throws(() => b.forEach(() => {}), /\[lite-logn\]/, 'consumed forEach');
    assert.throws(() => [...b], /\[lite-logn\]/, 'consumed iterate');
    assert.throws(() => a.meld(b), /\[lite-logn\]/, 'melding a consumed operand');
    // the survivor is unaffected and still correct
    assert.equal(a.size, 20);
});

// --- conservation across meld -----------------------------------------------

test('conservation across meld: nodes move root lists, never pools; full drain returns every slot', () => {
    const cap = 1024;
    const [a, b] = BinomialHeap.arena(cap, 'min', 2);
    for (let i = 0; i < 300; i++) a.push(i & 0xffff, (i * 2654435761) & 0xffff);
    for (let i = 0; i < 200; i++) b.push((i + 300) & 0xffff, (i * 40503) & 0xffff);
    assert.equal(a._pool.activeSlots, 500);
    assert.equal(a._pool.activeSlots + a._pool.freeListLength, cap);
    a.meld(b);
    assert.equal(a._pool.activeSlots, 500, 'meld does not touch the pool');
    assert.equal(a._pool.activeSlots + a._pool.freeListLength, cap);
    assert.equal(a.size, 500);
    let drained = 0;
    while (a.size > 0) { a.popMin(); drained++; }
    assert.equal(drained, 500);
    assert.equal(a._pool.activeSlots, 0, 'every slot returned after drain');
    assert.equal(a._pool.activeSlots + a._pool.freeListLength, cap);
});

// --- clear frees only own nodes in a shared arena ---------------------------

test('clear frees only THIS heap own nodes; an arena sibling is untouched', () => {
    const [a, b] = BinomialHeap.arena(200, 'min', 2);
    for (let i = 0; i < 60; i++) a.push(i, i);
    for (let i = 0; i < 40; i++) b.push(100 + i, i);
    assert.equal(a._pool.activeSlots, 100);
    a.clear();
    assert.equal(a.size, 0);
    assert.equal(b.size, 40, 'sibling untouched');
    assert.equal(a._pool.activeSlots, 40, 'only a own 60 nodes were freed');
    // b still drains correctly
    let cnt = 0; while (b.size > 0) { b.popMin(); cnt++; }
    assert.equal(cnt, 40);
});

// --- doors: push key/id/full ------------------------------------------------

test('push doors: key checked FIRST, then id, then full; empty peek/pop never throw', () => {
    const h = new BinomialHeap(8, 'min');
    for (const bad of [NaN, Infinity, -Infinity, '3', null, undefined, {}, Symbol('k'), 1n]) {
        assert.throws(() => h.push(0, bad), /\[lite-logn\]/, 'key ' + String(bad));
    }
    for (const bad of [-1, 1.5, NaN, 2 ** 32, '0', null, undefined, Symbol('i'), 3n]) {
        assert.throws(() => h.push(bad, 1), /\[lite-logn\]/, 'id ' + String(bad));
    }
    assert.equal(h.size, 0, 'failed doors leave size unchanged');
    const full = new BinomialHeap(2, 'min');
    full.push(0, 1); full.push(1, 2);
    assert.throws(() => full.push(2, 3), /\[lite-logn\]/, 'full arena');
    assert.equal(full.size, 2);
    // opaque id domain: 0 and 2^32-1 are legal
    const h2 = new BinomialHeap(4, 'min');
    h2.push(0, 5); h2.push(0xFFFFFFFF, 3);
    assert.equal(h2.peekMin(), 0xFFFFFFFF);
});

// --- forEach / iterator id multiset -----------------------------------------

test('forEach + [Symbol.iterator] yield the full id multiset (unspecified order)', () => {
    const h = new BinomialHeap(100, 'min');
    const ids = [];
    for (let i = 0; i < 50; i++) { const id = (i * 7) & 0xffff; h.push(id, (i * 3) % 97); ids.push(id); }
    const fe = [];
    h.forEach((id, key, heap) => { assert.equal(heap, h); assert.equal(typeof key, 'number'); fe.push(id); });
    assert.deepEqual(fe.slice().sort((a, b) => a - b), ids.slice().sort((a, b) => a - b));
    const it = [...h];
    assert.deepEqual(it.slice().sort((a, b) => a - b), ids.slice().sort((a, b) => a - b));
});

// --- tie keys (the _min-stays-a-root invariant) -----------------------------

test('all-equal keys: drain is stable and complete (the tie-demotion invariant holds)', () => {
    const n = 1000;
    const h = new BinomialHeap(n, 'min');
    for (let i = 0; i < n; i++) h.push(i & 0xffff, 42);
    let cnt = 0;
    while (h.size > 0) { assert.equal(h.peekMinKey(), 42); h.popMin(); cnt++; }
    assert.equal(cnt, n);
});

// --- small-n correctness ----------------------------------------------------

test('explicit small-n correctness (n = 1,2,3) for min and max', () => {
    for (const kind of ['min', 'max']) {
        for (const n of [1, 2, 3]) {
            const h = new BinomialHeap(n, kind);
            const keys = [];
            for (let i = 0; i < n; i++) { const v = ((i * 37 + 11) % 100); keys.push(v); h.push(i, v); }
            const model = keys.slice().sort((a, b) => (kind === 'min' ? a - b : b - a));
            for (let i = 0; i < n; i++) { assert.equal(h.peekMinKey(), model[i]); h.popMin(); }
            assert.equal(h.size, 0);
        }
    }
});

// --- LEAN surface -----------------------------------------------------------

test('BinomialHeap is LEAN + NON-ADDRESSABLE: no decreaseKey / remove / changeKey / rank / select', () => {
    const h = new BinomialHeap(8, 'min');
    assert.equal(typeof h.decreaseKey, 'undefined');
    assert.equal(typeof h.remove, 'undefined');
    assert.equal(typeof h.changeKey, 'undefined');
    assert.equal(typeof h.rank, 'undefined');
    assert.equal(typeof h.select, 'undefined');
});
