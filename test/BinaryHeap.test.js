/**
 * @zakkster/lite-logn -- BinaryHeap boundary + differential suite.
 *
 * The first member's contract, proven at the doors and against a reference model:
 *   - min AND max ordering; construction validation (bad capacity / kind);
 *   - push / pop ordering; peek / topKey / keyOf / has;
 *   - changeKey both directions (sift up + sift down) for both kinds;
 *   - remove of root / leaf / middle / absent id; duplicate push; overflow;
 *   - out-of-range id throws on every id-taking op; empty ops return undefined;
 *   - Floyd BinaryHeap.build differential vs a sorted reference;
 *   - a >= 1e5-op differential fuzz whose extraction order deep-equals a model,
 *     plus a smaller exhaustive pass asserting the heap-order invariant per op.
 */

import test from 'node:test';
import assert from 'node:assert/strict';
import { BinaryHeap } from '../LogN.js';

// --- helpers ----------------------------------------------------------------

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

// Pop every id in extraction order.
function drainIds(heap) {
    const out = [];
    let id;
    while ((id = heap.pop()) !== undefined) out.push(id);
    return out;
}

// Reference extremum over a Map<id, key>. Keys are unique in every caller, so the
// id is unambiguous.
function extremum(model, isMin) {
    let bestId = -1, bestKey = 0;
    for (const [id, key] of model) {
        if (bestId === -1 || (isMin ? key < bestKey : key > bestKey)) {
            bestId = id; bestKey = key;
        }
    }
    return { id: bestId, key: bestKey };
}

// Verify the heap-order invariant + the reverse-index consistency by reading the
// SoA internals (a white-box check the public surface cannot express).
function heapOrderOk(heap) {
    const K = heap._key, I = heap._id, P = heap._pos, n = heap._n;
    const min = heap.kind === 'min';
    for (let i = 0; i < n; i++) {
        if (P[I[i]] !== i) return false;            // reverse map points back
        const l = 2 * i + 1, r = 2 * i + 2;
        if (l < n && (min ? K[l] < K[i] : K[l] > K[i])) return false;
        if (r < n && (min ? K[r] < K[i] : K[r] > K[i])) return false;
    }
    return true;
}

// --- construction validation ------------------------------------------------

test('constructor rejects a bad capacity', () => {
    for (const bad of [0, -1, 1.5, NaN, Infinity, '8', null, undefined, 2 ** 31, Symbol('x')]) {
        assert.throws(() => new BinaryHeap(bad, 'min'), /\[lite-logn\]/,
            'capacity ' + String(bad) + ' must throw');
    }
});

test('constructor rejects a bad kind (undefined falls through to the "min" default)', () => {
    for (const bad of ['MIN', 'biggest', '', 0, null, {}]) {
        assert.throws(() => new BinaryHeap(8, bad), /\[lite-logn\]/,
            'kind ' + String(bad) + ' must throw');
    }
    assert.equal(new BinaryHeap(8, undefined).kind, 'min'); // default applies
});

test('constructor defaults kind to "min" and exposes getters', () => {
    const h = new BinaryHeap(16);
    assert.equal(h.kind, 'min');
    assert.equal(h.capacity, 16);
    assert.equal(h.size, 0);
    const hx = new BinaryHeap(4, 'max');
    assert.equal(hx.kind, 'max');
});

// --- push / pop ordering ----------------------------------------------------

test('min-heap pops ascending by key', () => {
    const h = new BinaryHeap(8, 'min');
    const pairs = [[0, 5], [1, 1], [2, 9], [3, 3], [4, 7]];
    for (const [id, key] of pairs) h.push(id, key);
    assert.equal(h.size, 5);
    assert.deepEqual(drainIds(h), [1, 3, 0, 4, 2]); // keys 1,3,5,7,9
    assert.equal(h.size, 0);
});

test('max-heap pops descending by key', () => {
    const h = new BinaryHeap(8, 'max');
    const pairs = [[0, 5], [1, 1], [2, 9], [3, 3], [4, 7]];
    for (const [id, key] of pairs) h.push(id, key);
    assert.deepEqual(drainIds(h), [2, 4, 0, 3, 1]); // keys 9,7,5,3,1
});

// --- peek / topKey / keyOf / has --------------------------------------------

test('peek / topKey / keyOf / has report the live state', () => {
    const h = new BinaryHeap(8, 'min');
    h.push(2, 4.0);
    h.push(5, 2.0);
    h.push(7, 6.0);
    assert.equal(h.peek(), 5);
    assert.equal(h.topKey(), 2.0);
    assert.equal(h.keyOf(2), 4.0);
    assert.equal(h.keyOf(5), 2.0);
    assert.equal(h.keyOf(3), undefined); // absent
    assert.equal(h.has(5), true);
    assert.equal(h.has(3), false);
});

// --- changeKey both directions, both kinds ----------------------------------

test('changeKey sifts UP (min-heap): a lowered key rises to the root', () => {
    const h = new BinaryHeap(8, 'min');
    for (const [id, k] of [[0, 5], [1, 6], [2, 7], [3, 8], [4, 9]]) h.push(id, k);
    h.changeKey(4, 1); // was the largest; now the smallest
    assert.equal(h.peek(), 4);
    assert.equal(h.topKey(), 1);
    assert.ok(heapOrderOk(h));
    assert.deepEqual(drainIds(h), [4, 0, 1, 2, 3]);
});

test('changeKey sifts DOWN (min-heap): a raised root sinks', () => {
    const h = new BinaryHeap(8, 'min');
    for (const [id, k] of [[0, 1], [1, 2], [2, 3], [3, 4], [4, 5]]) h.push(id, k);
    h.changeKey(0, 99); // root becomes the largest
    assert.equal(h.peek(), 1);
    assert.ok(heapOrderOk(h));
    assert.deepEqual(drainIds(h), [1, 2, 3, 4, 0]);
});

test('changeKey sifts UP (max-heap): a raised key rises to the root', () => {
    const h = new BinaryHeap(8, 'max');
    for (const [id, k] of [[0, 5], [1, 4], [2, 3], [3, 2], [4, 1]]) h.push(id, k);
    h.changeKey(4, 99);
    assert.equal(h.peek(), 4);
    assert.ok(heapOrderOk(h));
    assert.deepEqual(drainIds(h), [4, 0, 1, 2, 3]);
});

test('changeKey sifts DOWN (max-heap): a lowered root sinks', () => {
    const h = new BinaryHeap(8, 'max');
    for (const [id, k] of [[0, 9], [1, 8], [2, 7], [3, 6], [4, 5]]) h.push(id, k);
    h.changeKey(0, -1);
    assert.equal(h.peek(), 1);
    assert.ok(heapOrderOk(h));
    assert.deepEqual(drainIds(h), [1, 2, 3, 4, 0]);
});

test('changeKey on an absent id throws (no silent no-op)', () => {
    const h = new BinaryHeap(8, 'min');
    h.push(0, 1);
    assert.throws(() => h.changeKey(3, 2), /\[lite-logn\]/);
    assert.equal(h.size, 1);
});

// --- remove: root / leaf / middle / absent ----------------------------------

test('remove root / leaf / middle keeps a valid heap; absent id returns false', () => {
    function build() {
        const h = new BinaryHeap(16, 'min');
        for (const [id, k] of [[0, 1], [1, 2], [2, 3], [3, 4], [4, 5], [5, 6], [6, 7]]) h.push(id, k);
        return h;
    }
    // remove the root (id 0, key 1)
    let h = build();
    assert.equal(h.remove(0), true);
    assert.ok(heapOrderOk(h));
    assert.equal(h.has(0), false);
    assert.deepEqual(drainIds(h), [1, 2, 3, 4, 5, 6]);

    // remove a middle node (id 3, key 4)
    h = build();
    assert.equal(h.remove(3), true);
    assert.ok(heapOrderOk(h));
    assert.deepEqual(drainIds(h), [0, 1, 2, 4, 5, 6]);

    // remove a leaf (id 6, key 7 -- the largest, a leaf)
    h = build();
    assert.equal(h.remove(6), true);
    assert.ok(heapOrderOk(h));
    assert.deepEqual(drainIds(h), [0, 1, 2, 3, 4, 5]);

    // absent id -> false, no change
    h = build();
    assert.equal(h.remove(9), false);
    assert.equal(h.size, 7);
});

test('remove is idempotent: removing twice returns false the second time', () => {
    const h = new BinaryHeap(8, 'min');
    h.push(2, 5);
    assert.equal(h.remove(2), true);
    assert.equal(h.remove(2), false);
    assert.equal(h.size, 0);
});

// --- fail-closed doors ------------------------------------------------------

test('duplicate push throws (no silent overwrite)', () => {
    const h = new BinaryHeap(8, 'min');
    h.push(3, 1);
    assert.throws(() => h.push(3, 2), /\[lite-logn\]/);
    assert.equal(h.size, 1);
    assert.equal(h.keyOf(3), 1); // unchanged
});

test('overflow at capacity throws with size unchanged (0 silent drops)', () => {
    const h = new BinaryHeap(3, 'min');
    h.push(0, 1); h.push(1, 2); h.push(2, 3);
    assert.equal(h.size, 3);
    // NOTE: with capacity 3, id 3 is simultaneously out-of-range (the id
    // contract binds ids to [0, capacity)), so this throw is actually routed
    // through the id-range guard (_badId), not the capacity guard (_full) --
    // see the white-box test below for that path specifically.
    assert.throws(() => h.push(3, 4), /\[lite-logn\]/);
    assert.equal(h.size, 3);
    assert.deepEqual(drainIds(h), [0, 1, 2]);
});

// _full() (the "capacity reached" throw) is REDUNDANT-BUT-SAFE by construction,
// same class of finding as the lite-o1 SparseTable r<l guard: the id contract
// binds every id to [0, capacity), so `n === capacity` can only be reached by
// having already used every valid id -- any further push necessarily hits the
// duplicate guard or the out-of-range guard FIRST. _full() is unreachable
// through the public API alone. It is kept as defensive fail-closed belt (never
// remove it), and this white-box test forces `_n` directly to prove the guard
// itself is correct (message + no state corruption) if that invariant is ever
// broken by a future change to the id/capacity coupling.
test('push _full() guard is redundant-but-safe: unreachable via the public API ' +
    '(ids saturate first), but the throw itself is correct if forced (white-box)', () => {
    const h = new BinaryHeap(5, 'min');
    h.push(0, 1); h.push(1, 2); h.push(2, 3);
    assert.equal(h.size, 3);
    h._n = h._cap; // white-box: simulate "full" without exhausting the id space
    assert.throws(() => h.push(3, 4), /\[lite-logn\]/, '_full() must still throw if reached');
    assert.equal(h._n, h._cap, '_full() must not mutate size on its cold throw path');
    h._n = 3; // restore true size for continued heap use
    assert.deepEqual(drainIds(h), [0, 1, 2]);
});

test('a non-finite / non-number key fails closed', () => {
    const h = new BinaryHeap(8, 'min');
    for (const bad of [NaN, Infinity, -Infinity, '5', null, undefined, {}, Symbol('k')]) {
        assert.throws(() => h.push(0, bad), /\[lite-logn\]/, 'key ' + String(bad));
    }
    assert.equal(h.size, 0);
    h.push(0, 1);
    for (const bad of [NaN, Infinity, 'x']) {
        assert.throws(() => h.changeKey(0, bad), /\[lite-logn\]/);
    }
    assert.equal(h.keyOf(0), 1);
});

test('out-of-range id throws on push / changeKey / remove / has / keyOf', () => {
    const h = new BinaryHeap(8, 'min');
    h.push(0, 1);
    for (const bad of [-1, 8, 100, 1.5, NaN, Infinity, '0', null, undefined, Symbol('i')]) {
        assert.throws(() => h.push(bad, 1), /\[lite-logn\]/, 'push ' + String(bad));
        assert.throws(() => h.changeKey(bad, 1), /\[lite-logn\]/, 'changeKey ' + String(bad));
        assert.throws(() => h.remove(bad), /\[lite-logn\]/, 'remove ' + String(bad));
        assert.throws(() => h.has(bad), /\[lite-logn\]/, 'has ' + String(bad));
        assert.throws(() => h.keyOf(bad), /\[lite-logn\]/, 'keyOf ' + String(bad));
    }
});

// --- empty-heap contract ----------------------------------------------------

test('empty peek / pop / topKey return undefined and never throw', () => {
    const h = new BinaryHeap(4, 'min');
    assert.equal(h.peek(), undefined);
    assert.equal(h.pop(), undefined);
    assert.equal(h.topKey(), undefined);
    // drained back to empty behaves the same
    h.push(0, 1);
    h.pop();
    assert.equal(h.peek(), undefined);
    assert.equal(h.pop(), undefined);
    assert.equal(h.topKey(), undefined);
});

// --- clear / iteration ------------------------------------------------------

test('clear empties the heap and resets the reverse map', () => {
    const h = new BinaryHeap(8, 'min');
    for (let i = 0; i < 5; i++) h.push(i, 5 - i);
    h.clear();
    assert.equal(h.size, 0);
    assert.equal(h.has(0), false);
    assert.equal(h.keyOf(0), undefined);
    h.push(0, 1); // reusable after clear
    assert.equal(h.peek(), 0);
});

test('forEach and [Symbol.iterator] visit every live id (order unspecified)', () => {
    const h = new BinaryHeap(8, 'min');
    const ids = [4, 1, 7, 2, 5];
    for (const id of ids) h.push(id, id * 10);
    const seen = new Set();
    h.forEach((id, key) => { seen.add(id); assert.equal(key, id * 10); });
    assert.deepEqual([...seen].sort((a, b) => a - b), [...ids].sort((a, b) => a - b));
    const iter = new Set();
    for (const id of h) iter.add(id);
    assert.deepEqual([...iter].sort((a, b) => a - b), [...ids].sort((a, b) => a - b));
});

// --- Floyd build ------------------------------------------------------------

test('BinaryHeap.build (Floyd) produces a valid heap -- differential vs sorted', () => {
    const rng = mulberry32(0xBEEF);
    for (const kind of ['min', 'max']) {
        const n = 200, cap = 256;
        const ids = new Uint32Array(n);
        const keys = new Float64Array(n);
        const used = new Set();
        for (let i = 0; i < n; i++) {
            ids[i] = i;
            let k; do { k = Math.floor(rng() * 1e7); } while (used.has(k));
            used.add(k); keys[i] = k;
        }
        const h = BinaryHeap.build(kind, ids, keys, cap);
        assert.equal(h.size, n);
        assert.ok(heapOrderOk(h));
        // reference: ids sorted by key
        const ref = [...ids].sort((a, b) => kind === 'min' ? keys[a] - keys[b] : keys[b] - keys[a]);
        assert.deepEqual(drainIds(h), ref);
    }
});

test('BinaryHeap.build fails closed on bad input', () => {
    assert.throws(() => BinaryHeap.build('min', [0, 0], [1, 2], 8), /\[lite-logn\]/); // duplicate id
    assert.throws(() => BinaryHeap.build('min', [0, 9], [1, 2], 8), /\[lite-logn\]/); // id >= capacity
    assert.throws(() => BinaryHeap.build('min', [0, 1], [1, NaN], 8), /\[lite-logn\]/); // non-finite key
    assert.throws(() => BinaryHeap.build('min', [0, 1], [1], 8), /\[lite-logn\]/);      // length mismatch
    assert.throws(() => BinaryHeap.build('min', new Array(9).fill(0), new Array(9).fill(0), 8),
        /\[lite-logn\]/); // count > capacity
});

// --- exhaustive per-op invariant pass ---------------------------------------

test('heap-order invariant holds after EVERY op (small exhaustive pass)', () => {
    for (const kind of ['min', 'max']) {
        const isMin = kind === 'min';
        const cap = 64;
        const h = new BinaryHeap(cap, kind);
        const model = new Map();
        const used = new Set();
        const rng = mulberry32(isMin ? 0x11 : 0x22);
        const freshKey = () => {
            let k; do { k = Math.floor(rng() * 1e6); } while (used.has(k));
            used.add(k); return k;
        };
        for (let step = 0; step < 4000; step++) {
            const r = rng();
            if (r < 0.45 && model.size < cap) {
                const id = Math.floor(rng() * cap);
                if (!model.has(id)) { const k = freshKey(); h.push(id, k); model.set(id, k); }
            } else if (r < 0.65 && model.size > 0) {
                const { id } = extremum(model, isMin);
                assert.equal(h.pop(), id);
                model.delete(id);
            } else if (r < 0.85 && model.size > 0) {
                const keys = [...model.keys()];
                const id = keys[Math.floor(rng() * keys.length)];
                const k = freshKey(); h.changeKey(id, k); model.set(id, k);
            } else {
                const id = Math.floor(rng() * cap);
                assert.equal(h.remove(id), model.has(id));
                model.delete(id);
            }
            assert.equal(h.size, model.size);
            assert.ok(heapOrderOk(h), kind + ' invariant broke at step ' + step);
        }
    }
});

// --- large differential fuzz (>= 1e5 mixed ops) -----------------------------

test('differential fuzz: >= 1e5 mixed ops, extraction order deep-equals the model', () => {
    for (const kind of ['min', 'max']) {
        const isMin = kind === 'min';
        const cap = 400;
        const h = new BinaryHeap(cap, kind);
        const model = new Map();
        const used = new Set();
        const rng = mulberry32(isMin ? 0xABCDE : 0xFEDCB);
        const freshKey = () => {
            let k; do { k = Math.floor(rng() * 5e6); } while (used.has(k));
            used.add(k); return k;
        };
        let divergences = 0;
        const STEPS = 120000;
        for (let step = 0; step < STEPS; step++) {
            const r = rng();
            if (r < 0.40) {                       // push
                if (model.size < cap) {
                    const id = Math.floor(rng() * cap);
                    if (!model.has(id)) { const k = freshKey(); h.push(id, k); model.set(id, k); }
                }
            } else if (r < 0.65) {                // pop
                if (model.size === 0) {
                    if (h.pop() !== undefined) divergences++;
                } else {
                    const { id, key } = extremum(model, isMin);
                    if (h.topKey() !== key) divergences++;
                    if (h.peek() !== id) divergences++;   // unique keys -> id determined
                    if (h.pop() !== id) divergences++;
                    model.delete(id);
                }
            } else if (r < 0.85) {                // changeKey
                if (model.size > 0) {
                    const keys = [...model.keys()];
                    const id = keys[Math.floor(rng() * keys.length)];
                    const k = freshKey(); h.changeKey(id, k); model.set(id, k);
                }
            } else {                              // remove
                const id = Math.floor(rng() * cap);
                const had = model.has(id);
                if (h.remove(id) !== had) divergences++;
                if (had) model.delete(id);
            }
            if ((step & 2047) === 0) {
                if (h.size !== model.size) divergences++;
                if (!heapOrderOk(h)) divergences++;
            }
        }
        // final drain: the surviving extraction order must match the model exactly
        while (model.size > 0) {
            const { id } = extremum(model, isMin);
            if (h.pop() !== id) divergences++;
            model.delete(id);
        }
        if (h.pop() !== undefined) divergences++;
        assert.equal(divergences, 0, kind + '-heap fuzz produced ' + divergences + ' divergences');
    }
});
