/**
 * @zakkster/lite-logn -- SkipList boundary + differential suite.
 *
 * The fourth member's contract -- the family's first RANDOMIZED, pointer-based
 * member -- proven at the doors and against a plain-object + sorted-array oracle:
 *   - surface (every op exists; size / capacity getters);
 *   - construction validation (bad capacity: 0, negative, non-integer, > max; bad
 *     seed: negative, non-integer, > 2^32-1);
 *   - fail-closed key / value / bound doors (Symbol / BigInt / NaN / +-Infinity
 *     typeof-first, so the [lite-logn] tag pin is EXERCISED, not a bare throws);
 *   - empty / missing query -> undefined (no throw);
 *   - set on an existing key UPDATES the value in place (no new node, size steady);
 *   - ordered iteration is sorted; successor / predecessor / rangeIter correctness;
 *   - re-entrancy: mutating inside rangeIter throws [lite-logn];
 *   - determinism: a fixed seed replays an identical level sequence, a different
 *     seed diverges;
 *   - chi-square: the level generator is geometric (p = 0.5), df = 15, p > 0.001,
 *     over ~1e6 levels -- DETERMINISTIC (fixed seed), non-flaky, non-vacuous;
 *   - the conservation invariant activeSlots + freeListLength === capacity holds;
 *   - a >= 1e5 mixed-op fuzz vs an INDEPENDENT Map + sorted-array oracle, 0
 *     divergences.
 * Every test BITES: a broken impl (dropped guard, wrong successor strictness, a
 * leaked node, an off-by-one level shrink) fails it.
 */

import test from 'node:test';
import assert from 'node:assert/strict';
import { SkipList } from '../LogN.js';

// --- helpers ----------------------------------------------------------------

// mulberry32 -- deterministic PRNG so every fuzz run is reproducible. This is the
// TEST's own generator (drives the op stream); the SkipList's own PRNG is the NR
// LCG under test, seeded separately.
function mulberry32(seed) {
    let s = seed >>> 0;
    return function () {
        s = (s + 0x6D2B79F5) | 0;
        let t = Math.imul(s ^ (s >>> 15), s | 1);
        t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
        return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
}

function conserved(sl) {
    return sl._pool.activeSlots + sl._pool.freeListLength === sl._pool.capacity;
}

// --- surface ----------------------------------------------------------------

test('surface: every SkipList op exists', () => {
    const sl = new SkipList(8);
    for (const m of ['get', 'set', 'delete', 'successor', 'predecessor', 'rangeIter', 'forEach', 'clear']) {
        assert.equal(typeof sl[m], 'function', m + ' must be a method');
    }
    assert.equal(typeof sl.size, 'number');
    assert.equal(typeof sl.capacity, 'number');
    assert.equal(sl.capacity, 8);
    assert.equal(sl.size, 0);
});

// --- construction validation ------------------------------------------------

test('constructor rejects a bad capacity', () => {
    for (const bad of [0, -1, 1.5, NaN, Infinity, '8', null, undefined, Symbol('x'), 0x04000000, 2 ** 30]) {
        assert.throws(() => new SkipList(bad), /\[lite-logn\]/, 'capacity ' + String(bad) + ' must throw');
    }
    // 2^26 - 1 is the max; 2^26 is one past
    assert.throws(() => new SkipList(0x04000000), /\[lite-logn\]/);
    assert.doesNotThrow(() => new SkipList(1));
});

test('constructor rejects a bad seed but accepts a valid unsigned 32-bit integer', () => {
    for (const bad of [-1, 1.5, NaN, Infinity, '7', null, {}, Symbol('s'), 3n, 0x100000000]) {
        assert.throws(() => new SkipList(8, bad), /\[lite-logn\]/, 'seed ' + String(bad) + ' must throw');
    }
    assert.doesNotThrow(() => new SkipList(8, 0));
    assert.doesNotThrow(() => new SkipList(8, 0xFFFFFFFF));
    assert.doesNotThrow(() => new SkipList(8)); // seed omitted -> default
});

// --- fail-closed doors (the [lite-logn] tag pin, EXERCISED) ------------------

test('key door fails closed, typeof-first (Symbol / BigInt / NaN / +-Infinity)', () => {
    const sl = new SkipList(8);
    for (const bad of [NaN, Infinity, -Infinity, '5', null, undefined, {}, Symbol('k'), 3n]) {
        assert.throws(() => sl.get(bad), /\[lite-logn\]/, 'get ' + String(bad));
        assert.throws(() => sl.set(bad, 1), /\[lite-logn\]/, 'set key ' + String(bad));
        assert.throws(() => sl.delete(bad), /\[lite-logn\]/, 'delete ' + String(bad));
        assert.throws(() => sl.successor(bad), /\[lite-logn\]/, 'successor ' + String(bad));
        assert.throws(() => sl.predecessor(bad), /\[lite-logn\]/, 'predecessor ' + String(bad));
    }
});

test('value door fails closed, typeof-first', () => {
    const sl = new SkipList(8);
    for (const bad of [NaN, Infinity, -Infinity, '5', null, undefined, {}, Symbol('v'), 3n]) {
        assert.throws(() => sl.set(0, bad), /\[lite-logn\]/, 'set value ' + String(bad));
    }
    // a finite value beyond 2^31 is legal (the index ceiling is not a value ceiling)
    sl.set(0, 2 ** 40);
    assert.equal(sl.get(0), 2 ** 40);
});

test('rangeIter bound door: NaN throws, +-Infinity are legal unbounded ends, lo > hi throws', () => {
    const sl = new SkipList(8);
    for (const k of [1, 2, 3]) sl.set(k, k);
    assert.throws(() => sl.rangeIter(NaN, 5), /\[lite-logn\]/);
    assert.throws(() => sl.rangeIter(0, NaN), /\[lite-logn\]/);
    for (const bad of ['0', null, {}, Symbol('b'), 3n]) {
        assert.throws(() => sl.rangeIter(bad, 5), /\[lite-logn\]/, 'lo ' + String(bad));
        assert.throws(() => sl.rangeIter(0, bad), /\[lite-logn\]/, 'hi ' + String(bad));
    }
    assert.throws(() => sl.rangeIter(5, 2), /\[lite-logn\]/); // lo > hi
    assert.deepEqual([...sl.rangeIter(-Infinity, Infinity)], [1, 2, 3]); // unbounded both ends
});

test('a rejected op leaves a populated list exactly untouched', () => {
    const sl = new SkipList(16, 99);
    for (let k = 0; k < 8; k++) sl.set(k, k * 10);
    const before = [...sl.rangeIter(-Infinity, Infinity)].map((k) => [k, sl.get(k)]);
    for (const bad of [NaN, Infinity, '5', Symbol('k'), 3n]) {
        assert.throws(() => sl.set(bad, 1), /\[lite-logn\]/);
        assert.throws(() => sl.set(0, bad), /\[lite-logn\]/);
        assert.throws(() => sl.delete(bad), /\[lite-logn\]/);
    }
    const after = [...sl.rangeIter(-Infinity, Infinity)].map((k) => [k, sl.get(k)]);
    assert.deepEqual(after, before, 'a rejected op must not mutate any entry');
    assert.equal(sl.size, 8);
    assert.ok(conserved(sl));
});

// --- empty / missing query -> undefined -------------------------------------

test('empty and missing queries return undefined (no throw)', () => {
    const sl = new SkipList(8);
    assert.equal(sl.get(5), undefined);
    assert.equal(sl.successor(5), undefined);
    assert.equal(sl.predecessor(5), undefined);
    assert.deepEqual([...sl.rangeIter(-Infinity, Infinity)], []);
    sl.set(10, 100);
    assert.equal(sl.get(11), undefined); // present list, missing key
    assert.equal(sl.delete(11), false);  // idempotent absent-delete
    assert.equal(sl.get(10), 100);
});

// --- set updates existing key in place --------------------------------------

test('set on an existing key updates the value in place (no new node, size steady)', () => {
    const sl = new SkipList(16, 5);
    sl.set(7, 1);
    const activeAfterInsert = sl._pool.activeSlots;
    assert.equal(sl.size, 1);
    sl.set(7, 2);
    sl.set(7, 999);
    assert.equal(sl.get(7), 999, 'value updated');
    assert.equal(sl.size, 1, 'size unchanged by in-place update');
    assert.equal(sl._pool.activeSlots, activeAfterInsert, 'no new node allocated');
    assert.ok(conserved(sl));
});

// --- ordered iteration ------------------------------------------------------

test('rangeIter yields keys in ascending order regardless of insertion order', () => {
    const sl = new SkipList(64, 17);
    const order = [40, 10, 55, 5, 30, 60, 1, 22, 48, 33];
    for (const k of order) sl.set(k, k);
    const sorted = [...order].sort((a, b) => a - b);
    assert.deepEqual([...sl.rangeIter(-Infinity, Infinity)], sorted);
    // negative and fractional keys sort correctly too
    const sl2 = new SkipList(16, 3);
    for (const k of [-3.5, 2, -10, 0, 7.25, -1]) sl2.set(k, k);
    assert.deepEqual([...sl2.rangeIter(-Infinity, Infinity)], [-10, -3.5, -1, 0, 2, 7.25]);
});

test('rangeIter honors an inclusive [lo, hi] window', () => {
    const sl = new SkipList(64, 8);
    for (let k = 0; k < 20; k++) sl.set(k * 5, k); // 0,5,10,...,95
    assert.deepEqual([...sl.rangeIter(10, 30)], [10, 15, 20, 25, 30]);
    assert.deepEqual([...sl.rangeIter(12, 28)], [15, 20, 25]); // bounds off the keys
    assert.deepEqual([...sl.rangeIter(95, 200)], [95]);
    assert.deepEqual([...sl.rangeIter(200, 300)], []);
    assert.deepEqual([...sl.rangeIter(30, 30)], [30]); // single point
});

// --- successor / predecessor ------------------------------------------------

test('successor / predecessor are STRICT and correct at and off the keys', () => {
    const sl = new SkipList(64, 21);
    const keys = [10, 20, 30, 40, 50];
    for (const k of keys) sl.set(k, k);
    // strictly greater
    assert.equal(sl.successor(20), 30, 'succ at a present key is strictly greater');
    assert.equal(sl.successor(25), 30, 'succ off a key');
    assert.equal(sl.successor(50), undefined, 'no successor past the max');
    assert.equal(sl.successor(-100), 10);
    // strictly less
    assert.equal(sl.predecessor(30), 20, 'pred at a present key is strictly less');
    assert.equal(sl.predecessor(35), 30, 'pred off a key');
    assert.equal(sl.predecessor(10), undefined, 'no predecessor before the min');
    assert.equal(sl.predecessor(1000), 50);
});

// --- forEach ----------------------------------------------------------------

test('forEach visits (key, value) in ascending key order', () => {
    const sl = new SkipList(32, 11);
    const rng = mulberry32(0x1234);
    const model = new Map();
    for (let i = 0; i < 20; i++) { const k = Math.floor(rng() * 1000); const v = k * 3; sl.set(k, v); model.set(k, v); }
    const sorted = [...model.keys()].sort((a, b) => a - b);
    let idx = 0;
    sl.forEach((key, value, self) => {
        assert.equal(key, sorted[idx], 'forEach key order');
        assert.equal(value, model.get(key), 'forEach value at ' + key);
        assert.equal(self, sl);
        idx++;
    });
    assert.equal(idx, model.size);
});

// --- clear ------------------------------------------------------------------

test('clear empties the list, keeps capacity, and is reusable', () => {
    const sl = new SkipList(32, 6);
    for (let k = 0; k < 20; k++) sl.set(k, k);
    sl.clear();
    assert.equal(sl.size, 0);
    assert.equal(sl.capacity, 32);
    assert.equal(sl.get(5), undefined);
    assert.deepEqual([...sl.rangeIter(-Infinity, Infinity)], []);
    assert.ok(conserved(sl));
    sl.set(3, 30); // reusable after clear
    assert.equal(sl.get(3), 30);
    assert.equal(sl.size, 1);
});

// --- re-entrancy: mutate inside iterator -> throws --------------------------

test('mutating the list inside rangeIter throws [lite-logn]', () => {
    const sl = new SkipList(32, 4);
    for (let k = 0; k < 10; k++) sl.set(k, k);
    assert.throws(() => {
        for (const k of sl.rangeIter(-Infinity, Infinity)) {
            if (k === 3) sl.set(100, 1); // structural mutation mid-iteration
        }
    }, /\[lite-logn\]/);
    // delete mid-iteration also caught
    const sl2 = new SkipList(32, 4);
    for (let k = 0; k < 10; k++) sl2.set(k, k);
    assert.throws(() => {
        for (const k of sl2.rangeIter(-Infinity, Infinity)) {
            if (k === 2) sl2.delete(8);
        }
    }, /\[lite-logn\]/);
    // a full, unmodified iteration does NOT throw
    const sl3 = new SkipList(32, 4);
    for (let k = 0; k < 10; k++) sl3.set(k, k);
    assert.deepEqual([...sl3.rangeIter(-Infinity, Infinity)], [0, 1, 2, 3, 4, 5, 6, 7, 8, 9]);
});

// --- determinism ------------------------------------------------------------

// Drive the REAL level generator: insert one node into an empty list, read the
// list level (== the node height for a single node, since _level starts at 1 and
// a height is >= 1), delete, repeat. This exercises the actual LCG + clz32 path
// inside set(), not a re-implementation.
function levelSequence(seed, n, cap) {
    const sl = new SkipList(cap, seed);
    const seq = new Uint8Array(n);
    for (let i = 0; i < n; i++) { sl.set(0, 0); seq[i] = sl._level; sl.delete(0); }
    return seq;
}

test('determinism: a fixed seed replays an identical level sequence; a different seed diverges', () => {
    const a = levelSequence(1234, 500, 1 << 16);
    const b = levelSequence(1234, 500, 1 << 16);
    assert.deepEqual([...a], [...b], 'same seed -> identical sequence');
    const c = levelSequence(5678, 500, 1 << 16);
    assert.notDeepEqual([...a], [...c], 'different seed -> divergent sequence');

    // Full structural determinism: two lists, same seed, same op stream -> the
    // same ordered contents AND the same live height.
    const s1 = new SkipList(1024, 4242);
    const s2 = new SkipList(1024, 4242);
    const rng = mulberry32(0x55);
    for (let i = 0; i < 800; i++) { const k = Math.floor(rng() * 2000); s1.set(k, k); s2.set(k, k); }
    assert.equal(s1._level, s2._level, 'identical live height');
    assert.deepEqual([...s1.rangeIter(-Infinity, Infinity)], [...s2.rangeIter(-Infinity, Infinity)]);
});

// --- chi-square: the level generator is geometric (p = 0.5) ------------------
//
// H0: P(height = k) = 2^-k (a fair-coin tower). Bucket levels 1..15 individually
// and lump >= 16 into one tail bucket (its expected mass P(height >= 16) = 2^-15
// matches level 15's, ~30 counts at N = 1e6 -- comfortably above the >= 5 rule).
// df = (16 buckets) - 1 = 15; the upper-tail chi-square critical value at
// p = 0.001 for df = 15 is 37.697. The generator is DETERMINISTIC (fixed seed),
// so this is a fixed, non-flaky number, not a coin flip in CI. Non-vacuous: a
// biased generator (e.g. counting from the LCG's periodic low bits) blows past
// the critical value. cap = 2^20 so the column clamp (~21) does not distort the
// gated range 1..15 or the >= 16 tail.
test('chi-square: node levels follow a geometric p = 0.5 distribution (df = 15, p > 0.001)', () => {
    const N = 1_000_000;
    const K = 15;                       // last individually-counted level
    const CRIT_DF15_P001 = 37.697;      // upper-tail chi-square critical value
    const sl = new SkipList(1 << 20, 0x9E3779B9);
    const counts = new Float64Array(K + 2); // index 1..K individual, K+1 = tail (>= 16)
    for (let i = 0; i < N; i++) {
        sl.set(0, 0);
        const h = sl._level;
        if (h > K) counts[K + 1]++; else counts[h]++;
        sl.delete(0);
    }
    let chi2 = 0;
    for (let k = 1; k <= K; k++) {
        const E = N * Math.pow(2, -k);
        const O = counts[k];
        chi2 += ((O - E) * (O - E)) / E;
    }
    { // tail bucket (>= 16): expected mass P(height >= 16) = 2^-15
        const E = N * Math.pow(2, -K);
        const O = counts[K + 1];
        chi2 += ((O - E) * (O - E)) / E;
    }
    const df = 15;
    assert.equal(df, K + 1 - 1, 'df label = buckets - 1');
    assert.ok(chi2 < CRIT_DF15_P001,
        'chi2 = ' + chi2.toFixed(3) + ' (df = ' + df + ') must be < ' + CRIT_DF15_P001 +
        ' (p > 0.001) for a geometric p = 0.5 generator');
    // non-vacuity floor: a perfect-but-fake all-equal generator would score huge,
    // and a degenerate always-level-1 generator scores enormous; assert we saw a
    // real spread (level 1 near N/2, some level >= 10 mass).
    assert.ok(counts[1] > N * 0.4 && counts[1] < N * 0.6, 'level 1 mass ~ N/2');
    assert.ok(counts[10] > 0, 'the tower reaches level 10 at N = 1e6');
});

// --- capacity: full pool fails closed ---------------------------------------

test('a full pool fails closed on the (capacity + 1)-th distinct key', () => {
    const sl = new SkipList(4, 2);
    sl.set(1, 1); sl.set(2, 2); sl.set(3, 3); sl.set(4, 4);
    assert.equal(sl.size, 4);
    assert.throws(() => sl.set(5, 5), /\[lite-logn\]/, 'overflow must throw');
    assert.equal(sl.size, 4, 'a rejected overflow does not change size');
    // updating an EXISTING key at capacity is fine (no new node)
    sl.set(2, 22);
    assert.equal(sl.get(2), 22);
    // freeing a slot re-opens capacity
    sl.delete(1);
    assert.doesNotThrow(() => sl.set(5, 5));
    assert.equal(sl.get(5), 5);
    assert.ok(conserved(sl));
});

// --- the big differential fuzz (>= 1e5 mixed ops vs a Map + sorted oracle) ---

test('differential fuzz: >= 1e5 mixed ops match a Map + sorted-array oracle (0 divergences)', () => {
    const CAP = 4096;
    const KEYSPACE = 3000;              // < CAP so the pool never overflows mid-run
    const STEPS = 120000;
    const sl = new SkipList(CAP, 0xC0FFEE);
    const model = new Map();            // key -> value oracle
    const rng = mulberry32(0xABCDEF);
    let divergences = 0;

    const sortedKeys = () => [...model.keys()].sort((a, b) => a - b);

    for (let step = 0; step < STEPS; step++) {
        const r = rng();
        const key = Math.floor(rng() * KEYSPACE);
        if (r < 0.40) {                                  // set
            const v = Math.floor(rng() * 1e6);
            sl.set(key, v); model.set(key, v);
        } else if (r < 0.60) {                           // delete
            const had = model.delete(key);
            if (sl.delete(key) !== had) divergences++;
        } else if (r < 0.75) {                           // get
            const got = sl.get(key);
            const exp = model.has(key) ? model.get(key) : undefined;
            if (got !== exp) divergences++;
        } else if (r < 0.85) {                           // successor
            const ks = sortedKeys();
            let exp;
            for (const k of ks) { if (k > key) { exp = k; break; } }
            if (sl.successor(key) !== exp) divergences++;
        } else if (r < 0.95) {                           // predecessor
            const ks = sortedKeys();
            let exp;
            for (const k of ks) { if (k < key) exp = k; else break; }
            if (sl.predecessor(key) !== exp) divergences++;
        } else {                                         // rangeIter over a window
            const lo = key;
            const hi = lo + Math.floor(rng() * 400);
            const exp = sortedKeys().filter((k) => k >= lo && k <= hi);
            const got = [...sl.rangeIter(lo, hi)];
            if (got.length !== exp.length) divergences++;
            else for (let i = 0; i < got.length; i++) if (got[i] !== exp[i]) { divergences++; break; }
        }
        if (sl.size !== model.size) divergences++;
        if ((step & 8191) === 0 && !conserved(sl)) divergences++;
    }

    // final full sweep: ordered contents + values match exactly
    const finalKeys = sortedKeys();
    assert.deepEqual([...sl.rangeIter(-Infinity, Infinity)], finalKeys, 'final ordered keys');
    for (const k of finalKeys) if (sl.get(k) !== model.get(k)) divergences++;
    assert.equal(divergences, 0, 'fuzz produced ' + divergences + ' divergences');
    assert.ok(conserved(sl), 'conservation invariant holds at the end');
    assert.equal(sl.size, model.size);
});
