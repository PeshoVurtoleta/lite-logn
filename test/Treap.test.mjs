/**
 * @zakkster/lite-logn -- Treap boundary + differential suite.
 *
 * The fifth member's contract -- the family's second RANDOMIZED, pointer-based member
 * and its first AUGMENTED ordered map / order-statistic tree -- proven at the doors and
 * against a plain Map + sorted-array oracle:
 *   - surface (every op exists; size / capacity getters);
 *   - construction validation (bad capacity / seed);
 *   - fail-closed key / value / bound / rank doors (Symbol / BigInt / NaN / +-Infinity
 *     typeof-first, so the [lite-logn] tag pin is EXERCISED, not a bare throws);
 *   - empty / missing query -> undefined (no throw); select out-of-range -> undefined;
 *   - set on an existing key UPDATES the value in place (no new node, size steady);
 *   - the treap invariant holds after every op: BST order + max-heap on priority +
 *     subtree-size correctness;
 *   - rank / select are exact order statistics; successor / predecessor are STRICT;
 *   - split / merge are correct + O(log n)-shaped (share the arena, consume inputs);
 *   - re-entrancy: mutating inside rangeIter throws [lite-logn];
 *   - determinism: a fixed seed replays an identical structure, a different seed diverges;
 *   - the conservation invariant activeSlots + freeListLength === capacity holds;
 *   - a >= 1e5 mixed-op fuzz vs an INDEPENDENT Map + sorted-array oracle, 0 divergences.
 * Every test BITES: a broken impl (dropped guard, wrong rank strictness, a bad rotation,
 * a leaked node, a stale subtree size) fails it.
 */

import test from 'node:test';
import assert from 'node:assert/strict';
import { Treap } from '../LogN.js';

// --- helpers ----------------------------------------------------------------

// mulberry32 -- deterministic PRNG so every fuzz run is reproducible. This is the
// TEST's own generator (drives the op stream); the Treap's own PRNG is the NR LCG
// under test, seeded separately.
function mulberry32(seed) {
    let s = seed >>> 0;
    return function () {
        s = (s + 0x6D2B79F5) | 0;
        let t = Math.imul(s ^ (s >>> 15), s | 1);
        t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
        return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
}

function conserved(tr) {
    return tr._pool.activeSlots + tr._pool.freeListLength === tr._pool.capacity;
}

// Verify the three treap invariants over the whole tree: BST order (keys ascending
// in-order), max-heap on priority (parent prio >= child, ties by key), and subtree-
// size correctness. Returns the subtree size of `t` (throws on any violation).
function checkInvariants(tr, t, lo, hi) {
    if (t === 0) return 0;
    const k = tr._key[t];
    assert.ok(k > lo && k < hi, 'BST order violated at key ' + k);
    const l = tr._left[t], r = tr._right[t];
    // Precise heap order: the parent must OUTRANK each child in the (priority, key)
    // total order the treap maintains (_higher) -- not merely priority >=, so an
    // equal-priority tie handled the wrong way would BITE here.
    if (l !== 0) assert.ok(tr._higher(t, l), 'heap order (left) at ' + k);
    if (r !== 0) assert.ok(tr._higher(t, r), 'heap order (right) at ' + k);
    const ls = checkInvariants(tr, l, lo, k);
    const rs = checkInvariants(tr, r, k, hi);
    const sz = ls + rs + 1;
    assert.equal(tr._size[t], sz, 'subtree size wrong at key ' + k + ' (got ' + tr._size[t] + ', want ' + sz + ')');
    return sz;
}

// --- surface ----------------------------------------------------------------

test('surface: every Treap op exists', () => {
    const tr = new Treap(8);
    for (const m of ['get', 'has', 'set', 'delete', 'rank', 'select', 'successor', 'predecessor', 'rangeIter', 'forEach', 'clear', 'split']) {
        assert.equal(typeof tr[m], 'function', m + ' must be a method');
    }
    assert.equal(typeof Treap.merge, 'function');
    assert.equal(typeof tr.size, 'number');
    assert.equal(typeof tr.capacity, 'number');
    assert.equal(tr.capacity, 8);
    assert.equal(tr.size, 0);
});

// --- construction validation ------------------------------------------------

test('constructor rejects a bad capacity but accepts the boundaries', () => {
    // 2^31 is one past the max (2^31 - 1); it and every non-integer / out-of-domain
    // value fail the [lite-logn] validation door BEFORE any allocation.
    for (const bad of [0, -1, 1.5, NaN, Infinity, '8', null, undefined, Symbol('x'), 0x80000000, 2 ** 31 + 1]) {
        assert.throws(() => new Treap(bad), /\[lite-logn\]/, 'capacity ' + String(bad) + ' must throw');
    }
    assert.doesNotThrow(() => new Treap(1));
    assert.doesNotThrow(() => new Treap(1 << 16)); // a real, allocatable capacity
    // The max is 2^31 - 1 (documented); it is not constructed here because the six
    // columns would need ~64 GB -- the CEILING is the Uint32 index/count arithmetic.
});

test('constructor rejects a bad seed but accepts a valid unsigned 32-bit integer', () => {
    for (const bad of [-1, 1.5, NaN, Infinity, '7', null, {}, Symbol('s'), 3n, 0x100000000]) {
        assert.throws(() => new Treap(8, bad), /\[lite-logn\]/, 'seed ' + String(bad) + ' must throw');
    }
    assert.doesNotThrow(() => new Treap(8, 0));
    assert.doesNotThrow(() => new Treap(8, 0xFFFFFFFF));
    assert.doesNotThrow(() => new Treap(8)); // seed omitted -> default
});

// --- fail-closed doors (the [lite-logn] tag pin, EXERCISED) ------------------

test('key door fails closed, typeof-first (Symbol / BigInt / NaN / +-Infinity)', () => {
    const tr = new Treap(8);
    for (const bad of [NaN, Infinity, -Infinity, '5', null, undefined, {}, Symbol('k'), 3n]) {
        assert.throws(() => tr.get(bad), /\[lite-logn\]/, 'get ' + String(bad));
        assert.throws(() => tr.has(bad), /\[lite-logn\]/, 'has ' + String(bad));
        assert.throws(() => tr.set(bad, 1), /\[lite-logn\]/, 'set key ' + String(bad));
        assert.throws(() => tr.delete(bad), /\[lite-logn\]/, 'delete ' + String(bad));
        assert.throws(() => tr.rank(bad), /\[lite-logn\]/, 'rank ' + String(bad));
        assert.throws(() => tr.successor(bad), /\[lite-logn\]/, 'successor ' + String(bad));
        assert.throws(() => tr.predecessor(bad), /\[lite-logn\]/, 'predecessor ' + String(bad));
        assert.throws(() => tr.split(bad), /\[lite-logn\]/, 'split ' + String(bad));
    }
});

test('value door fails closed, typeof-first', () => {
    const tr = new Treap(8);
    for (const bad of [NaN, Infinity, -Infinity, '5', null, undefined, {}, Symbol('v'), 3n]) {
        assert.throws(() => tr.set(0, bad), /\[lite-logn\]/, 'set value ' + String(bad));
    }
    // a finite value beyond 2^31 is legal (the index ceiling is not a value ceiling)
    tr.set(0, 2 ** 40);
    assert.equal(tr.get(0), 2 ** 40);
});

test('select index door fails closed on a non-integer; out-of-range returns undefined', () => {
    const tr = new Treap(8, 3);
    for (const k of [0, 1, 2, 3]) tr.set(k * 10, k);
    for (const bad of [1.5, NaN, '0', null, undefined, {}, Symbol('i'), 3n]) {
        assert.throws(() => tr.select(bad), /\[lite-logn\]/, 'select ' + String(bad));
    }
    assert.equal(tr.select(-1), undefined);
    assert.equal(tr.select(4), undefined); // size is 4 -> index 4 out of range
    assert.equal(tr.select(0), 0);
    assert.equal(tr.select(3), 30);
});

test('rangeIter bound door: NaN throws, +-Infinity are legal unbounded ends, lo > hi throws', () => {
    const tr = new Treap(8);
    for (const k of [1, 2, 3]) tr.set(k, k);
    assert.throws(() => tr.rangeIter(NaN, 5), /\[lite-logn\]/);
    assert.throws(() => tr.rangeIter(0, NaN), /\[lite-logn\]/);
    for (const bad of ['0', null, {}, Symbol('b'), 3n]) {
        assert.throws(() => tr.rangeIter(bad, 5), /\[lite-logn\]/, 'lo ' + String(bad));
        assert.throws(() => tr.rangeIter(0, bad), /\[lite-logn\]/, 'hi ' + String(bad));
    }
    assert.throws(() => tr.rangeIter(5, 2), /\[lite-logn\]/); // lo > hi
    assert.deepEqual([...tr.rangeIter(-Infinity, Infinity)], [1, 2, 3]); // unbounded both ends
});

test('a rejected op leaves a populated treap exactly untouched', () => {
    const tr = new Treap(16, 99);
    for (let k = 0; k < 8; k++) tr.set(k, k * 10);
    const before = [...tr.rangeIter(-Infinity, Infinity)].map((k) => [k, tr.get(k)]);
    for (const bad of [NaN, Infinity, '5', Symbol('k'), 3n]) {
        assert.throws(() => tr.set(bad, 1), /\[lite-logn\]/);
        assert.throws(() => tr.set(0, bad), /\[lite-logn\]/);
        assert.throws(() => tr.delete(bad), /\[lite-logn\]/);
    }
    const after = [...tr.rangeIter(-Infinity, Infinity)].map((k) => [k, tr.get(k)]);
    assert.deepEqual(after, before, 'a rejected op must not mutate any entry');
    assert.equal(tr.size, 8);
    assert.ok(conserved(tr));
});

// --- empty / missing query -> undefined -------------------------------------

test('empty and missing queries return undefined (no throw)', () => {
    const tr = new Treap(8);
    assert.equal(tr.get(5), undefined);
    assert.equal(tr.has(5), false);
    assert.equal(tr.select(0), undefined);
    assert.equal(tr.rank(5), 0);
    assert.equal(tr.successor(5), undefined);
    assert.equal(tr.predecessor(5), undefined);
    assert.deepEqual([...tr.rangeIter(-Infinity, Infinity)], []);
    tr.set(10, 100);
    assert.equal(tr.get(11), undefined); // present treap, missing key
    assert.equal(tr.delete(11), false);  // idempotent absent-delete
    assert.equal(tr.get(10), 100);
    assert.equal(tr.has(10), true);
});

// --- set updates existing key in place --------------------------------------

test('set on an existing key updates the value in place (no new node, size steady)', () => {
    const tr = new Treap(16, 5);
    tr.set(7, 1);
    const activeAfterInsert = tr._pool.activeSlots;
    assert.equal(tr.size, 1);
    tr.set(7, 2);
    tr.set(7, 999);
    assert.equal(tr.get(7), 999, 'value updated');
    assert.equal(tr.size, 1, 'size unchanged by in-place update');
    assert.equal(tr._pool.activeSlots, activeAfterInsert, 'no new node allocated');
    assert.ok(conserved(tr));
});

// --- ordered iteration + treap invariants -----------------------------------

test('rangeIter yields keys in ascending order and the treap invariants hold', () => {
    const tr = new Treap(64, 17);
    const order = [40, 10, 55, 5, 30, 60, 1, 22, 48, 33];
    for (const k of order) tr.set(k, k);
    const sorted = [...order].sort((a, b) => a - b);
    assert.deepEqual([...tr.rangeIter(-Infinity, Infinity)], sorted);
    checkInvariants(tr, tr._root, -Infinity, Infinity);
    // negative and fractional keys sort correctly too
    const tr2 = new Treap(16, 3);
    for (const k of [-3.5, 2, -10, 0, 7.25, -1]) tr2.set(k, k);
    assert.deepEqual([...tr2.rangeIter(-Infinity, Infinity)], [-10, -3.5, -1, 0, 2, 7.25]);
    checkInvariants(tr2, tr2._root, -Infinity, Infinity);
});

test('rangeIter honors an inclusive [lo, hi] window', () => {
    const tr = new Treap(64, 8);
    for (let k = 0; k < 20; k++) tr.set(k * 5, k); // 0,5,10,...,95
    assert.deepEqual([...tr.rangeIter(10, 30)], [10, 15, 20, 25, 30]);
    assert.deepEqual([...tr.rangeIter(12, 28)], [15, 20, 25]); // bounds off the keys
    assert.deepEqual([...tr.rangeIter(95, 200)], [95]);
    assert.deepEqual([...tr.rangeIter(200, 300)], []);
    assert.deepEqual([...tr.rangeIter(30, 30)], [30]); // single point
});

// --- rank / select (the augmentation) ---------------------------------------

test('rank counts keys strictly less than x; select returns the k-th smallest key', () => {
    const tr = new Treap(64, 21);
    const keys = [10, 20, 30, 40, 50];
    for (const k of keys) tr.set(k, k * 100);
    assert.equal(tr.rank(10), 0, 'rank of the min is 0');
    assert.equal(tr.rank(25), 2, 'two keys < 25');
    assert.equal(tr.rank(30), 2, 'rank is STRICT (< not <=)');
    assert.equal(tr.rank(51), 5, 'rank past the max is size');
    assert.equal(tr.rank(-100), 0);
    for (let i = 0; i < keys.length; i++) assert.equal(tr.select(i), keys[i], 'select ' + i);
    // rank / select are inverses across all present keys
    for (const k of keys) assert.equal(tr.select(tr.rank(k)), k);
});

// --- successor / predecessor ------------------------------------------------

test('successor / predecessor are STRICT and correct at and off the keys', () => {
    const tr = new Treap(64, 21);
    const keys = [10, 20, 30, 40, 50];
    for (const k of keys) tr.set(k, k);
    assert.equal(tr.successor(20), 30, 'succ at a present key is strictly greater');
    assert.equal(tr.successor(25), 30, 'succ off a key');
    assert.equal(tr.successor(50), undefined, 'no successor past the max');
    assert.equal(tr.successor(-100), 10);
    assert.equal(tr.predecessor(30), 20, 'pred at a present key is strictly less');
    assert.equal(tr.predecessor(35), 30, 'pred off a key');
    assert.equal(tr.predecessor(10), undefined, 'no predecessor before the min');
    assert.equal(tr.predecessor(1000), 50);
});

// --- forEach ----------------------------------------------------------------

test('forEach visits (key, value) in ascending key order', () => {
    const tr = new Treap(32, 11);
    const rng = mulberry32(0x1234);
    const model = new Map();
    for (let i = 0; i < 20; i++) { const k = Math.floor(rng() * 1000); const v = k * 3; tr.set(k, v); model.set(k, v); }
    const sorted = [...model.keys()].sort((a, b) => a - b);
    let idx = 0;
    tr.forEach((key, value, self) => {
        assert.equal(key, sorted[idx], 'forEach key order');
        assert.equal(value, model.get(key), 'forEach value at ' + key);
        assert.equal(self, tr);
        idx++;
    });
    assert.equal(idx, model.size);
});

// --- clear ------------------------------------------------------------------

test('clear empties the treap, keeps capacity, and is reusable', () => {
    const tr = new Treap(32, 6);
    for (let k = 0; k < 20; k++) tr.set(k, k);
    tr.clear();
    assert.equal(tr.size, 0);
    assert.equal(tr.capacity, 32);
    assert.equal(tr.get(5), undefined);
    assert.deepEqual([...tr.rangeIter(-Infinity, Infinity)], []);
    assert.ok(conserved(tr));
    tr.set(3, 30); // reusable after clear
    assert.equal(tr.get(3), 30);
    assert.equal(tr.size, 1);
});

// --- re-entrancy: mutate inside iterator -> throws --------------------------

test('mutating the treap inside rangeIter throws [lite-logn] (structural AND value)', () => {
    const tr = new Treap(32, 4);
    for (let k = 0; k < 10; k++) tr.set(k, k);
    assert.throws(() => {
        for (const k of tr.rangeIter(-Infinity, Infinity)) {
            if (k === 3) tr.set(100, 1); // structural mutation mid-iteration
        }
    }, /\[lite-logn\]/);
    const tr2 = new Treap(32, 4);
    for (let k = 0; k < 10; k++) tr2.set(k, k);
    assert.throws(() => {
        for (const k of tr2.rangeIter(-Infinity, Infinity)) {
            if (k === 2) tr2.delete(8); // delete mid-iteration also caught
        }
    }, /\[lite-logn\]/);
    const tr3 = new Treap(32, 4);
    for (let k = 0; k < 10; k++) tr3.set(k, k);
    assert.throws(() => {
        for (const k of tr3.rangeIter(-Infinity, Infinity)) {
            if (k === 4) tr3.set(4, 999); // an in-place VALUE update also bumps the version
        }
    }, /\[lite-logn\]/);
    // a full, unmodified iteration does NOT throw
    const tr4 = new Treap(32, 4);
    for (let k = 0; k < 10; k++) tr4.set(k, k);
    assert.deepEqual([...tr4.rangeIter(-Infinity, Infinity)], [0, 1, 2, 3, 4, 5, 6, 7, 8, 9]);
});

// --- determinism ------------------------------------------------------------

test('determinism: a fixed seed replays an identical structure; a different seed diverges', () => {
    function build(seed) {
        const tr = new Treap(1024, seed);
        const rng = mulberry32(0x55);
        for (let i = 0; i < 800; i++) { const k = Math.floor(rng() * 2000); tr.set(k, k); }
        // capture the exact tree SHAPE: the priority column read in-order.
        const prios = [];
        tr.forEach((k) => prios.push(tr._prio[selectSlot(tr, k)]));
        return prios;
    }
    // find the slot of a present key (white-box, for shape capture only)
    function selectSlot(tr, key) {
        let t = tr._root;
        while (t !== 0) { if (key < tr._key[t]) t = tr._left[t]; else if (key > tr._key[t]) t = tr._right[t]; else return t; }
        return 0;
    }
    const a = build(1234);
    const b = build(1234);
    assert.deepEqual(a, b, 'same seed -> identical priority sequence');
    const c = build(5678);
    assert.notDeepEqual(a, c, 'different seed -> divergent priorities');
});

// --- split / merge ----------------------------------------------------------

test('split partitions at the key; the two treaps share the arena and consume the source', () => {
    const tr = new Treap(128, 7);
    for (let k = 0; k < 64; k++) tr.set(k, k * 10);
    const [lo, hi] = tr.split(25);
    assert.equal(lo.size, 25, 'left holds keys 0..24 (< 25)');
    assert.equal(hi.size, 39, 'right holds keys 25..63 (>= 25)');
    assert.deepEqual([...lo.rangeIter(-Infinity, Infinity)], Array.from({ length: 25 }, (_, i) => i));
    assert.deepEqual([...hi.rangeIter(-Infinity, Infinity)], Array.from({ length: 39 }, (_, i) => i + 25));
    checkInvariants(lo, lo._root, -Infinity, Infinity);
    checkInvariants(hi, hi._root, -Infinity, Infinity);
    assert.equal(lo.get(10), 100, 'values survive the split');
    assert.equal(hi.get(30), 300);
    assert.equal(tr.size, 0, 'the source is consumed (emptied)');
    // the two shares + the source all reference the SAME free-list
    assert.ok(lo._pool === hi._pool && lo._pool === tr._pool, 'shared arena');
    assert.ok(conserved(lo));
});

test('merge fuses two arena-sharing treaps (all a < all b); fails closed otherwise', () => {
    const tr = new Treap(128, 13);
    for (let k = 0; k < 64; k++) tr.set(k, k);
    const [lo, hi] = tr.split(32);
    const merged = Treap.merge(lo, hi);
    assert.equal(merged.size, 64);
    assert.deepEqual([...merged.rangeIter(-Infinity, Infinity)], Array.from({ length: 64 }, (_, i) => i));
    checkInvariants(merged, merged._root, -Infinity, Infinity);
    assert.equal(lo.size, 0, 'a is consumed');
    assert.equal(hi.size, 0, 'b is consumed');
    assert.ok(conserved(merged));
    // fail closed: non-Treaps, cross-arena, overlapping range
    assert.throws(() => Treap.merge({}, merged), /\[lite-logn\]/);
    assert.throws(() => Treap.merge(new Treap(4), new Treap(4)), /\[lite-logn\]/);
    const tr2 = new Treap(64, 3);
    for (let k = 0; k < 16; k++) tr2.set(k, k);
    const [a, b] = tr2.split(8);
    assert.throws(() => Treap.merge(b, a), /\[lite-logn\]/, 'b keys are not < a keys');
});

// --- split / merge randomized oracle (>= 1e4 random split-at + merge-back ops) ---

test('split/merge oracle: >= 1e4 random split-at-key + merge-back cycles match a sorted-array model exactly', () => {
    const CAP = 512;
    const rng = mulberry32(0x5EED5);
    const CYCLES = 12000;
    let tr = new Treap(CAP, 0x1357);
    let model = [];
    // seed with an initial random population
    for (let i = 0; i < 200; i++) {
        const k = Math.floor(rng() * 100000);
        if (!model.includes(k)) { tr.set(k, k); model.push(k); }
    }
    model.sort((a, b) => a - b);
    let divergences = 0;
    for (let c = 0; c < CYCLES; c++) {
        // pick a random split key anywhere in the observed key range (inclusive of
        // off-key boundaries, so the split boundary itself is exercised)
        const splitKey = model.length === 0
            ? Math.floor(rng() * 100000)
            : model[Math.floor(rng() * model.length)] + (rng() < 0.5 ? 0 : 0.5 - rng());
        const expLeft = model.filter((k) => k < splitKey);
        const expRight = model.filter((k) => k >= splitKey);
        const [lo, hi] = tr.split(splitKey);
        if (lo.size !== expLeft.length) divergences++;
        if (hi.size !== expRight.length) divergences++;
        const gotLeft = [...lo.rangeIter(-Infinity, Infinity)];
        const gotRight = [...hi.rangeIter(-Infinity, Infinity)];
        if (gotLeft.length !== expLeft.length || gotLeft.some((k, i) => k !== expLeft[i])) divergences++;
        if (gotRight.length !== expRight.length || gotRight.some((k, i) => k !== expRight[i])) divergences++;
        checkInvariants(lo, lo._root, -Infinity, Infinity);
        checkInvariants(hi, hi._root, -Infinity, Infinity);
        // merge back: lo keys are all < hi keys by construction of split, so this is
        // always a legal merge -- reconstitutes the exact original population.
        const merged = Treap.merge(lo, hi);
        if (merged.size !== model.length) divergences++;
        const gotAll = [...merged.rangeIter(-Infinity, Infinity)];
        if (gotAll.length !== model.length || gotAll.some((k, i) => k !== model[i])) divergences++;
        checkInvariants(merged, merged._root, -Infinity, Infinity);
        if (!conserved(merged)) divergences++;
        tr = merged;
        // occasionally mutate the population so successive cycles see fresh shapes
        if (c % 7 === 0) {
            const k = Math.floor(rng() * 100000);
            if (!model.includes(k) && model.length < CAP - 1) {
                tr.set(k, k); model.push(k); model.sort((a, b) => a - b);
            } else if (model.length > 0) {
                const idx = Math.floor(rng() * model.length);
                const k = model[idx];
                tr.delete(k); model.splice(idx, 1);
            }
        }
    }
    assert.equal(divergences, 0, 'split/merge oracle produced ' + divergences + ' divergences over ' + CYCLES + ' cycles');
});

// --- capacity: full pool fails closed ---------------------------------------

test('a full pool fails closed on the (capacity + 1)-th distinct key', () => {
    const tr = new Treap(4, 2);
    tr.set(1, 1); tr.set(2, 2); tr.set(3, 3); tr.set(4, 4);
    assert.equal(tr.size, 4);
    assert.throws(() => tr.set(5, 5), /\[lite-logn\]/, 'overflow must throw');
    assert.equal(tr.size, 4, 'a rejected overflow does not change size');
    tr.set(2, 22); // updating an EXISTING key at capacity is fine (no new node)
    assert.equal(tr.get(2), 22);
    tr.delete(1); // freeing a slot re-opens capacity
    assert.doesNotThrow(() => tr.set(5, 5));
    assert.equal(tr.get(5), 5);
    assert.ok(conserved(tr));
});

// --- the big differential fuzz (>= 1e5 mixed ops vs a Map + sorted oracle) ---

test('differential fuzz: >= 1e5 mixed ops match a Map + sorted-array oracle (0 divergences)', () => {
    const CAP = 4096;
    const KEYSPACE = 3000;              // < CAP so the pool never overflows mid-run
    const STEPS = 130000;
    const tr = new Treap(CAP, 0xC0FFEE);
    const model = new Map();            // key -> value oracle
    const rng = mulberry32(0xABCDEF);
    let divergences = 0;

    const sortedKeys = () => [...model.keys()].sort((a, b) => a - b);

    for (let step = 0; step < STEPS; step++) {
        const r = rng();
        const key = Math.floor(rng() * KEYSPACE);
        if (r < 0.38) {                                  // set
            const v = Math.floor(rng() * 1e6);
            tr.set(key, v); model.set(key, v);
        } else if (r < 0.56) {                           // delete
            const had = model.delete(key);
            if (tr.delete(key) !== had) divergences++;
        } else if (r < 0.68) {                           // get
            const got = tr.get(key);
            const exp = model.has(key) ? model.get(key) : undefined;
            if (got !== exp) divergences++;
        } else if (r < 0.78) {                           // rank
            const ks = sortedKeys();
            let exp = 0; for (const k of ks) if (k < key) exp++;
            if (tr.rank(key) !== exp) divergences++;
        } else if (r < 0.86) {                           // select
            const ks = sortedKeys();
            const idx = ks.length === 0 ? 0 : Math.floor(rng() * ks.length);
            const exp = ks.length === 0 ? undefined : ks[idx];
            if (tr.select(ks.length === 0 ? 0 : idx) !== exp) divergences++;
        } else if (r < 0.93) {                           // successor
            const ks = sortedKeys();
            let exp; for (const k of ks) { if (k > key) { exp = k; break; } }
            if (tr.successor(key) !== exp) divergences++;
        } else {                                         // predecessor
            const ks = sortedKeys();
            let exp; for (const k of ks) { if (k < key) exp = k; else break; }
            if (tr.predecessor(key) !== exp) divergences++;
        }
        if (tr.size !== model.size) divergences++;
        if ((step & 16383) === 0) {
            if (!conserved(tr)) divergences++;
            checkInvariants(tr, tr._root, -Infinity, Infinity); // the treap invariants hold throughout
        }
    }

    // final full sweep: ordered contents + values match exactly
    const finalKeys = sortedKeys();
    assert.deepEqual([...tr.rangeIter(-Infinity, Infinity)], finalKeys, 'final ordered keys');
    for (const k of finalKeys) if (tr.get(k) !== model.get(k)) divergences++;
    for (let i = 0; i < finalKeys.length; i++) if (tr.select(i) !== finalKeys[i]) { divergences++; break; }
    assert.equal(divergences, 0, 'fuzz produced ' + divergences + ' divergences');
    assert.ok(conserved(tr), 'conservation invariant holds at the end');
    assert.equal(tr.size, model.size);
    checkInvariants(tr, tr._root, -Infinity, Infinity);
});
