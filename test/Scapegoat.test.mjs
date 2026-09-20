/**
 * @zakkster/lite-logn -- Scapegoat boundary + differential suite.
 *
 * The sixth member's contract -- the family's DETERMINISTIC weight-balanced BST (the honest
 * pair to Treap: worst-case-O(log n) get, amortized-O(log n) set/delete) and an AUGMENTED
 * ordered map / order-statistic tree -- proven at the doors and against a Map + sorted-array
 * oracle:
 *   - surface (every op exists; size / capacity / alpha getters; NO split / merge);
 *   - construction validation (bad capacity; alpha in the OPEN interval (0.55, 0.75), both
 *     ends throw; typeof-first);
 *   - fail-closed key / value / bound / rank doors (Symbol / BigInt / NaN / +-Infinity);
 *   - empty / missing query -> undefined (no throw); select out-of-range -> undefined;
 *   - set on an existing key UPDATES the value in place (no new node, size steady);
 *   - the invariants hold after every op: BST order + subtree-size correctness + a hard
 *     weight-balance HEIGHT bound (<= 2.1*log2(n)+2, incl. after 4096 ADVERSARIAL ascending
 *     inserts -- the rebuild-forcing worst case);
 *   - rank / select are exact order statistics; successor / predecessor are STRICT;
 *   - re-entrancy: mutating inside rangeIter throws [lite-logn] (structural AND value);
 *   - determinism: NO RNG -- the same insert order builds a byte-identical shape;
 *   - the conservation invariant activeSlots + freeListLength === capacity holds (incl.
 *     across rebuild-heavy traces);
 *   - a >= 1e5 mixed-op fuzz vs an INDEPENDENT Map + sorted-array oracle, 0 divergences.
 * Every test BITES: a broken impl (dropped guard, wrong rank strictness, a leaked node on
 * rebuild, a stale subtree size, an off-by-one flatten) fails it.
 */

import test from 'node:test';
import assert from 'node:assert/strict';
import { Scapegoat } from '../LogN.js';

// --- helpers ----------------------------------------------------------------

// mulberry32 -- deterministic PRNG so every fuzz run is reproducible. This is the TEST's own
// generator (drives the op stream); the Scapegoat under test uses NO RNG at all.
function mulberry32(seed) {
    let s = seed >>> 0;
    return function () {
        s = (s + 0x6D2B79F5) | 0;
        let t = Math.imul(s ^ (s >>> 15), s | 1);
        t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
        return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
}

function conserved(sg) {
    return sg._pool.activeSlots + sg._pool.freeListLength === sg._pool.capacity;
}

// Verify the invariants over the whole tree: BST order (keys ascending in-order) and subtree-
// size correctness. Returns the subtree size of `t` (throws on any violation).
function checkInvariants(sg, t, lo, hi) {
    if (t === 0) return 0;
    const k = sg._key[t];
    assert.ok(k > lo && k < hi, 'BST order violated at key ' + k);
    const ls = checkInvariants(sg, sg._left[t], lo, k);
    const rs = checkInvariants(sg, sg._right[t], k, hi);
    const sz = ls + rs + 1;
    assert.equal(sg._size[t], sz, 'subtree size wrong at key ' + k + ' (got ' + sg._size[t] + ', want ' + sz + ')');
    return sz;
}

function height(sg, t) {
    if (t === 0) return 0;
    return 1 + Math.max(height(sg, sg._left[t]), height(sg, sg._right[t]));
}

// --- surface ----------------------------------------------------------------

test('surface: every Scapegoat op exists; there is NO split / merge (the asymmetry vs Treap)', () => {
    const sg = new Scapegoat(8);
    for (const m of ['get', 'has', 'set', 'delete', 'rank', 'select', 'successor', 'predecessor', 'rangeIter', 'forEach', 'clear']) {
        assert.equal(typeof sg[m], 'function', m + ' must be a method');
    }
    assert.equal(typeof sg.split, 'undefined', 'Scapegoat must NOT expose split');
    assert.equal(typeof Scapegoat.merge, 'undefined', 'Scapegoat must NOT expose a static merge');
    assert.equal(typeof sg.size, 'number');
    assert.equal(typeof sg.capacity, 'number');
    assert.equal(sg.capacity, 8);
    assert.equal(sg.size, 0);
    assert.ok(Math.abs(sg.alpha - 2 / 3) < 1e-12, 'default alpha is 2/3');
});

// --- construction validation ------------------------------------------------

test('constructor rejects a bad capacity but accepts the boundaries', () => {
    for (const bad of [0, -1, 1.5, NaN, Infinity, '8', null, undefined, Symbol('x'), 0x80000000, 2 ** 31 + 1]) {
        assert.throws(() => new Scapegoat(bad), /\[lite-logn\]/, 'capacity ' + String(bad) + ' must throw');
    }
    assert.doesNotThrow(() => new Scapegoat(1));
    assert.doesNotThrow(() => new Scapegoat(1 << 16));
});

test('constructor validates alpha as the OPEN interval (0.55, 0.75) -- BOTH ends throw', () => {
    for (const bad of [0.55, 0.75, 0.5, 0.8, 0, 1, -1, NaN, Infinity, '0.6', null, {}, Symbol('a'), 3n]) {
        assert.throws(() => new Scapegoat(8, bad), /\[lite-logn\]/, 'alpha ' + String(bad) + ' must throw');
    }
    assert.doesNotThrow(() => new Scapegoat(8, 0.56));
    assert.doesNotThrow(() => new Scapegoat(8, 0.6));
    assert.doesNotThrow(() => new Scapegoat(8, 0.74));
    assert.doesNotThrow(() => new Scapegoat(8)); // default 2/3
    const sg = new Scapegoat(8, 0.6);
    assert.ok(Math.abs(sg.alpha - 0.6) < 1e-12, 'alpha is frozen and reported');
});

// --- fail-closed doors (the [lite-logn] tag pin, EXERCISED) ------------------

test('key door fails closed, typeof-first (Symbol / BigInt / NaN / +-Infinity)', () => {
    const sg = new Scapegoat(8);
    for (const bad of [NaN, Infinity, -Infinity, '5', null, undefined, {}, Symbol('k'), 3n]) {
        assert.throws(() => sg.get(bad), /\[lite-logn\]/, 'get ' + String(bad));
        assert.throws(() => sg.has(bad), /\[lite-logn\]/, 'has ' + String(bad));
        assert.throws(() => sg.set(bad, 1), /\[lite-logn\]/, 'set key ' + String(bad));
        assert.throws(() => sg.delete(bad), /\[lite-logn\]/, 'delete ' + String(bad));
        assert.throws(() => sg.rank(bad), /\[lite-logn\]/, 'rank ' + String(bad));
        assert.throws(() => sg.successor(bad), /\[lite-logn\]/, 'successor ' + String(bad));
        assert.throws(() => sg.predecessor(bad), /\[lite-logn\]/, 'predecessor ' + String(bad));
    }
});

test('value door fails closed, typeof-first', () => {
    const sg = new Scapegoat(8);
    for (const bad of [NaN, Infinity, -Infinity, '5', null, undefined, {}, Symbol('v'), 3n]) {
        assert.throws(() => sg.set(0, bad), /\[lite-logn\]/, 'set value ' + String(bad));
    }
    sg.set(0, 2 ** 40); // a finite value beyond 2^31 is legal
    assert.equal(sg.get(0), 2 ** 40);
});

test('select index door fails closed on a non-integer; out-of-range returns undefined', () => {
    const sg = new Scapegoat(8);
    for (const k of [0, 1, 2, 3]) sg.set(k * 10, k);
    for (const bad of [1.5, NaN, '0', null, undefined, {}, Symbol('i'), 3n]) {
        assert.throws(() => sg.select(bad), /\[lite-logn\]/, 'select ' + String(bad));
    }
    assert.equal(sg.select(-1), undefined);
    assert.equal(sg.select(4), undefined);
    assert.equal(sg.select(0), 0);
    assert.equal(sg.select(3), 30);
});

test('rangeIter bound door: NaN throws, +-Infinity are legal unbounded ends, lo > hi throws', () => {
    const sg = new Scapegoat(8);
    for (const k of [1, 2, 3]) sg.set(k, k);
    assert.throws(() => sg.rangeIter(NaN, 5), /\[lite-logn\]/);
    assert.throws(() => sg.rangeIter(0, NaN), /\[lite-logn\]/);
    for (const bad of ['0', null, {}, Symbol('b'), 3n]) {
        assert.throws(() => sg.rangeIter(bad, 5), /\[lite-logn\]/, 'lo ' + String(bad));
        assert.throws(() => sg.rangeIter(0, bad), /\[lite-logn\]/, 'hi ' + String(bad));
    }
    assert.throws(() => sg.rangeIter(5, 2), /\[lite-logn\]/); // lo > hi
    assert.deepEqual([...sg.rangeIter(-Infinity, Infinity)], [1, 2, 3]);
});

test('a rejected op leaves a populated tree exactly untouched', () => {
    const sg = new Scapegoat(16);
    for (let k = 0; k < 8; k++) sg.set(k, k * 10);
    const before = [...sg.rangeIter(-Infinity, Infinity)].map((k) => [k, sg.get(k)]);
    for (const bad of [NaN, Infinity, '5', Symbol('k'), 3n]) {
        assert.throws(() => sg.set(bad, 1), /\[lite-logn\]/);
        assert.throws(() => sg.set(0, bad), /\[lite-logn\]/);
        assert.throws(() => sg.delete(bad), /\[lite-logn\]/);
    }
    const after = [...sg.rangeIter(-Infinity, Infinity)].map((k) => [k, sg.get(k)]);
    assert.deepEqual(after, before, 'a rejected op must not mutate any entry');
    assert.equal(sg.size, 8);
    assert.ok(conserved(sg));
});

// --- empty / missing query -> undefined -------------------------------------

test('empty and missing queries return undefined (no throw)', () => {
    const sg = new Scapegoat(8);
    assert.equal(sg.get(5), undefined);
    assert.equal(sg.has(5), false);
    assert.equal(sg.select(0), undefined);
    assert.equal(sg.rank(5), 0);
    assert.equal(sg.successor(5), undefined);
    assert.equal(sg.predecessor(5), undefined);
    assert.deepEqual([...sg.rangeIter(-Infinity, Infinity)], []);
    sg.set(10, 100);
    assert.equal(sg.get(11), undefined);
    assert.equal(sg.delete(11), false);
    assert.equal(sg.get(10), 100);
    assert.equal(sg.has(10), true);
});

// --- set updates existing key in place --------------------------------------

test('set on an existing key updates the value in place (no new node, size steady, no rebuild)', () => {
    const sg = new Scapegoat(16);
    sg.set(7, 1);
    const activeAfterInsert = sg._pool.activeSlots;
    assert.equal(sg.size, 1);
    sg.set(7, 2);
    sg.set(7, 999);
    assert.equal(sg.get(7), 999, 'value updated');
    assert.equal(sg.size, 1, 'size unchanged by in-place update');
    assert.equal(sg._pool.activeSlots, activeAfterInsert, 'no new node allocated');
    assert.ok(conserved(sg));
});

// --- ordered iteration + invariants -----------------------------------------

test('rangeIter yields keys in ascending order and the invariants hold', () => {
    const sg = new Scapegoat(64);
    const order = [40, 10, 55, 5, 30, 60, 1, 22, 48, 33];
    for (const k of order) sg.set(k, k);
    const sorted = [...order].sort((a, b) => a - b);
    assert.deepEqual([...sg.rangeIter(-Infinity, Infinity)], sorted);
    checkInvariants(sg, sg._root, -Infinity, Infinity);
    const sg2 = new Scapegoat(16);
    for (const k of [-3.5, 2, -10, 0, 7.25, -1]) sg2.set(k, k);
    assert.deepEqual([...sg2.rangeIter(-Infinity, Infinity)], [-10, -3.5, -1, 0, 2, 7.25]);
    checkInvariants(sg2, sg2._root, -Infinity, Infinity);
});

test('rangeIter honors an inclusive [lo, hi] window', () => {
    const sg = new Scapegoat(64);
    for (let k = 0; k < 20; k++) sg.set(k * 5, k); // 0,5,10,...,95
    assert.deepEqual([...sg.rangeIter(10, 30)], [10, 15, 20, 25, 30]);
    assert.deepEqual([...sg.rangeIter(12, 28)], [15, 20, 25]);
    assert.deepEqual([...sg.rangeIter(95, 200)], [95]);
    assert.deepEqual([...sg.rangeIter(200, 300)], []);
    assert.deepEqual([...sg.rangeIter(30, 30)], [30]);
});

// --- rank / select (the augmentation) ---------------------------------------

test('rank counts keys strictly less than x; select returns the k-th smallest key', () => {
    const sg = new Scapegoat(64);
    const keys = [10, 20, 30, 40, 50];
    for (const k of keys) sg.set(k, k * 100);
    assert.equal(sg.rank(10), 0, 'rank of the min is 0');
    assert.equal(sg.rank(25), 2, 'two keys < 25');
    assert.equal(sg.rank(30), 2, 'rank is STRICT (< not <=)');
    assert.equal(sg.rank(51), 5, 'rank past the max is size');
    assert.equal(sg.rank(-100), 0);
    for (let i = 0; i < keys.length; i++) assert.equal(sg.select(i), keys[i], 'select ' + i);
    for (const k of keys) assert.equal(sg.select(sg.rank(k)), k);
});

// --- successor / predecessor ------------------------------------------------

test('successor / predecessor are STRICT and correct at and off the keys', () => {
    const sg = new Scapegoat(64);
    const keys = [10, 20, 30, 40, 50];
    for (const k of keys) sg.set(k, k);
    assert.equal(sg.successor(20), 30);
    assert.equal(sg.successor(25), 30);
    assert.equal(sg.successor(50), undefined);
    assert.equal(sg.successor(-100), 10);
    assert.equal(sg.predecessor(30), 20);
    assert.equal(sg.predecessor(35), 30);
    assert.equal(sg.predecessor(10), undefined);
    assert.equal(sg.predecessor(1000), 50);
});

// --- forEach ----------------------------------------------------------------

test('forEach visits (key, value) in ascending key order', () => {
    const sg = new Scapegoat(32);
    const rng = mulberry32(0x1234);
    const model = new Map();
    for (let i = 0; i < 20; i++) { const k = Math.floor(rng() * 1000); const v = k * 3; sg.set(k, v); model.set(k, v); }
    const sorted = [...model.keys()].sort((a, b) => a - b);
    let idx = 0;
    sg.forEach((key, value, self) => {
        assert.equal(key, sorted[idx], 'forEach key order');
        assert.equal(value, model.get(key), 'forEach value at ' + key);
        assert.equal(self, sg);
        idx++;
    });
    assert.equal(idx, model.size);
});

// --- clear ------------------------------------------------------------------

test('clear empties the tree, keeps capacity, and is reusable', () => {
    const sg = new Scapegoat(32);
    for (let k = 0; k < 20; k++) sg.set(k, k);
    sg.clear();
    assert.equal(sg.size, 0);
    assert.equal(sg.capacity, 32);
    assert.equal(sg.get(5), undefined);
    assert.deepEqual([...sg.rangeIter(-Infinity, Infinity)], []);
    assert.ok(conserved(sg));
    sg.set(3, 30);
    assert.equal(sg.get(3), 30);
    assert.equal(sg.size, 1);
});

// --- re-entrancy: mutate inside iterator -> throws --------------------------

test('mutating the tree inside rangeIter throws [lite-logn] (structural AND value)', () => {
    const sg = new Scapegoat(32);
    for (let k = 0; k < 10; k++) sg.set(k, k);
    assert.throws(() => {
        for (const k of sg.rangeIter(-Infinity, Infinity)) { if (k === 3) sg.set(100, 1); }
    }, /\[lite-logn\]/);
    const sg2 = new Scapegoat(32);
    for (let k = 0; k < 10; k++) sg2.set(k, k);
    assert.throws(() => {
        for (const k of sg2.rangeIter(-Infinity, Infinity)) { if (k === 2) sg2.delete(8); }
    }, /\[lite-logn\]/);
    const sg3 = new Scapegoat(32);
    for (let k = 0; k < 10; k++) sg3.set(k, k);
    assert.throws(() => {
        for (const k of sg3.rangeIter(-Infinity, Infinity)) { if (k === 4) sg3.set(4, 999); } // value update bumps version
    }, /\[lite-logn\]/);
    const sg4 = new Scapegoat(32);
    for (let k = 0; k < 10; k++) sg4.set(k, k);
    assert.deepEqual([...sg4.rangeIter(-Infinity, Infinity)], [0, 1, 2, 3, 4, 5, 6, 7, 8, 9]);
});

// --- determinism: NO RNG ----------------------------------------------------

test('determinism: the SAME insert order builds a byte-identical shape (no RNG)', () => {
    function build() {
        const sg = new Scapegoat(1024);
        const rng = mulberry32(0x55); // the TEST drives the op stream; the tree has no RNG
        for (let i = 0; i < 800; i++) { const k = Math.floor(rng() * 2000); sg.set(k, k); }
        // capture the exact tree SHAPE: the left/right link columns read in-order.
        const shape = [];
        sg.forEach((k) => { const s = slotOf(sg, k); shape.push(sg._left[s], sg._right[s], sg._size[s]); });
        return shape;
    }
    function slotOf(sg, key) {
        let t = sg._root;
        while (t !== 0) { if (key < sg._key[t]) t = sg._left[t]; else if (key > sg._key[t]) t = sg._right[t]; else return t; }
        return 0;
    }
    const a = build();
    const b = build();
    assert.deepEqual(a, b, 'same insert order -> identical shape (deterministic, no RNG)');
});

// --- weight-balance HEIGHT bound (incl. the rebuild-forcing adversarial case) ---

test('the height stays bounded (<= 2.1*log2(n)+2) even after 4096 ADVERSARIAL ascending inserts', () => {
    const N = 4096;
    const sg = new Scapegoat(N);
    for (let k = 0; k < N; k++) sg.set(k, k); // ascending -> the rebuild-forcing worst case
    const h = height(sg, sg._root);
    const bound = 2.1 * Math.log2(N) + 2;
    assert.ok(h <= bound, 'ascending-insert height ' + h + ' must be <= ' + bound.toFixed(2));
    checkInvariants(sg, sg._root, -Infinity, Infinity);
    assert.equal(sg.size, N);
    assert.ok(conserved(sg), 'no node leaked across the rebuild storm');
    assert.deepEqual([...sg.rangeIter(-Infinity, Infinity)], Array.from({ length: N }, (_, i) => i));
    // a tighter alpha (closer to 0.55) -> a tighter height bound
    const sg2 = new Scapegoat(N, 0.56);
    for (let k = 0; k < N; k++) sg2.set(k, k);
    const h2 = height(sg2, sg2._root);
    assert.ok(h2 <= 2.1 * Math.log2(N) + 2, 'alpha=0.56 height ' + h2 + ' bounded too');
    checkInvariants(sg2, sg2._root, -Infinity, Infinity);
});

test('a delete-heavy trace triggers the global rebuild and keeps the tree balanced + conserved', () => {
    const N = 4096;
    const sg = new Scapegoat(N);
    for (let k = 0; k < N; k++) sg.set(k, k);
    // delete 7/8 of the keys -> size falls below alpha*maxCount -> a global rebuild fires
    for (let k = 0; k < N; k++) if (k % 8 !== 0) sg.delete(k);
    assert.equal(sg.size, N / 8);
    checkInvariants(sg, sg._root, -Infinity, Infinity);
    const h = height(sg, sg._root);
    assert.ok(h <= 2.1 * Math.log2(Math.max(2, sg.size)) + 2, 'post-shrink height ' + h + ' bounded');
    assert.ok(conserved(sg), 'no node leaked / double-freed across the delete-driven rebuild');
    for (let k = 0; k < N; k += 8) assert.equal(sg.get(k), k, 'surviving values intact at ' + k);
});

// --- capacity: full pool fails closed ---------------------------------------

test('a full pool fails closed on the (capacity + 1)-th distinct key', () => {
    const sg = new Scapegoat(4);
    sg.set(1, 1); sg.set(2, 2); sg.set(3, 3); sg.set(4, 4);
    assert.equal(sg.size, 4);
    assert.throws(() => sg.set(5, 5), /\[lite-logn\]/, 'overflow must throw');
    assert.equal(sg.size, 4, 'a rejected overflow does not change size');
    sg.set(2, 22); // updating an EXISTING key at capacity is fine (no new node)
    assert.equal(sg.get(2), 22);
    sg.delete(1); // freeing a slot re-opens capacity
    assert.doesNotThrow(() => sg.set(5, 5));
    assert.equal(sg.get(5), 5);
    assert.ok(conserved(sg));
});

// --- the big differential fuzz (>= 1e5 mixed ops vs a Map + sorted oracle) ---

test('differential fuzz: >= 1e5 mixed ops match a Map + sorted-array oracle (0 divergences)', () => {
    const CAP = 4096;
    const KEYSPACE = 3000;              // < CAP so the pool never overflows mid-run
    const STEPS = 130000;
    const sg = new Scapegoat(CAP);
    const model = new Map();
    const rng = mulberry32(0xABCDEF);
    let divergences = 0;

    const sortedKeys = () => [...model.keys()].sort((a, b) => a - b);

    for (let step = 0; step < STEPS; step++) {
        const r = rng();
        const key = Math.floor(rng() * KEYSPACE);
        if (r < 0.4) {                                   // set
            const v = Math.floor(rng() * 1e6);
            sg.set(key, v); model.set(key, v);
        } else if (r < 0.58) {                           // delete
            const had = model.delete(key);
            if (sg.delete(key) !== had) divergences++;
        } else if (r < 0.7) {                            // get
            const got = sg.get(key);
            const exp = model.has(key) ? model.get(key) : undefined;
            if (got !== exp) divergences++;
        } else if (r < 0.8) {                            // rank
            const ks = sortedKeys();
            let exp = 0; for (const k of ks) if (k < key) exp++;
            if (sg.rank(key) !== exp) divergences++;
        } else if (r < 0.88) {                           // select
            const ks = sortedKeys();
            const idx = ks.length === 0 ? 0 : Math.floor(rng() * ks.length);
            const exp = ks.length === 0 ? undefined : ks[idx];
            if (sg.select(ks.length === 0 ? 0 : idx) !== exp) divergences++;
        } else if (r < 0.94) {                           // successor
            const ks = sortedKeys();
            let exp; for (const k of ks) { if (k > key) { exp = k; break; } }
            if (sg.successor(key) !== exp) divergences++;
        } else {                                         // predecessor
            const ks = sortedKeys();
            let exp; for (const k of ks) { if (k < key) exp = k; else break; }
            if (sg.predecessor(key) !== exp) divergences++;
        }
        if (sg.size !== model.size) divergences++;
        if ((step & 16383) === 0) {
            if (!conserved(sg)) divergences++;
            checkInvariants(sg, sg._root, -Infinity, Infinity); // invariants hold throughout
        }
    }

    const finalKeys = sortedKeys();
    assert.deepEqual([...sg.rangeIter(-Infinity, Infinity)], finalKeys, 'final ordered keys');
    for (const k of finalKeys) if (sg.get(k) !== model.get(k)) divergences++;
    for (let i = 0; i < finalKeys.length; i++) if (sg.select(i) !== finalKeys[i]) { divergences++; break; }
    assert.equal(divergences, 0, 'fuzz produced ' + divergences + ' divergences');
    assert.ok(conserved(sg), 'conservation invariant holds at the end');
    assert.equal(sg.size, model.size);
    checkInvariants(sg, sg._root, -Infinity, Infinity);
});
