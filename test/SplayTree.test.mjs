/**
 * @zakkster/lite-logn -- SplayTree boundary + differential suite.
 *
 * The eighth member's contract -- the family's SELF-ADJUSTING ordered map, the first whose
 * READS restructure the tree -- proven at the doors and against a plain Map + sorted-array
 * oracle:
 *   - surface (every op exists; size / capacity getters; NO rank/select/split -- LEAN);
 *   - construction validation (bad capacity; no seed arg);
 *   - fail-closed key / value / bound doors (Symbol / BigInt / NaN / +-Infinity typeof-first,
 *     so the [lite-logn] tag pin is EXERCISED, not a bare throws);
 *   - empty / missing query -> undefined (no throw);
 *   - set on an existing key UPDATES the value in place (no new node, size steady);
 *   - the BST invariant holds after every op (in-order ascending, no cycle, size correct);
 *   - the SPLAY contract: get / has / successor / predecessor move the touched (or closest)
 *     node to the ROOT and BUMP the version; rangeIter / forEach / [Symbol.iterator] are
 *     NON-splaying (leave _root + _version byte-identical);
 *   - delete JOINS correctly (all keys survive except the removed one, order intact);
 *   - successor / predecessor are STRICT;
 *   - re-entrancy: mutating inside rangeIter throws [lite-logn] -- INCLUDING a get (a read
 *     splays, so it counts as a mutation);
 *   - the slot-0 NIL header is restored clean after every splay;
 *   - the conservation invariant activeSlots + freeListLength === capacity holds;
 *   - a >= 1e5 mixed-op fuzz vs an INDEPENDENT Map + sorted oracle, 0 divergences.
 * Every test BITES: a broken impl (dropped guard, a bad rotation, a leaked node, a splay that
 * corrupts BST order, a read that forgot to bump the version) fails it.
 */

import test from 'node:test';
import assert from 'node:assert/strict';
import { SplayTree } from '../LogN.js';

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

function conserved(sp) {
    return sp._pool.activeSlots + sp._pool.freeListLength === sp._pool.capacity;
}

// The NIL sentinel / splay header (slot 0) must be restored to clean 0 columns after any
// operation -- a splay that leaves _left[0]/_right[0] dirty would corrupt a later descent.
function nilClean(sp) {
    return sp._left[0] === 0 && sp._right[0] === 0;
}

// Verify BST order + subtree consistency over the whole tree: keys strictly ascending in-
// order, every key within (lo, hi), and the live node count matches size. Returns node count.
function checkBst(sp, t, lo, hi) {
    if (t === 0) return 0;
    const k = sp._key[t];
    assert.ok(k > lo && k < hi, 'BST order violated at key ' + k);
    const l = checkBst(sp, sp._left[t], lo, k);
    const r = checkBst(sp, sp._right[t], k, hi);
    return l + r + 1;
}

function assertInvariants(sp) {
    const count = checkBst(sp, sp._root, -Infinity, Infinity);
    assert.equal(count, sp.size, 'live node count (' + count + ') must equal size (' + sp.size + ')');
    assert.ok(conserved(sp), 'conservation invariant (activeSlots + freeList === capacity)');
    assert.ok(nilClean(sp), 'slot-0 NIL header must be restored clean');
}

// --- surface ----------------------------------------------------------------

test('surface: every SplayTree op exists; the LEAN asymmetry vs Treap/Scapegoat holds', () => {
    const sp = new SplayTree(8);
    for (const m of ['get', 'has', 'set', 'delete', 'successor', 'predecessor', 'rangeIter', 'forEach', 'clear']) {
        assert.equal(typeof sp[m], 'function', m + ' must be a method');
    }
    assert.equal(typeof sp[Symbol.iterator], 'function', 'Symbol.iterator must exist');
    assert.equal(typeof sp.size, 'number');
    assert.equal(typeof sp.capacity, 'number');
    assert.equal(sp.capacity, 8);
    assert.equal(sp.size, 0);
    // LEAN member: deliberately NO rank / select / split / merge.
    assert.equal(typeof sp.rank, 'undefined', 'no rank (LEAN)');
    assert.equal(typeof sp.select, 'undefined', 'no select (LEAN)');
    assert.equal(typeof sp.split, 'undefined', 'no split (LEAN)');
    assert.equal(typeof SplayTree.merge, 'undefined', 'no static merge (LEAN)');
});

// --- construction validation ------------------------------------------------

test('construction: bad capacity fails closed; a valid capacity builds an empty tree', () => {
    for (const bad of [0, -1, 1.5, NaN, Infinity, -Infinity, '8', null, undefined, {}, Symbol('x'), 3n, 2 ** 31]) {
        assert.throws(() => new SplayTree(bad), /\[lite-logn\]/, 'ctor ' + String(bad));
    }
    const sp = new SplayTree(1);
    assert.equal(sp.size, 0);
    assert.equal(sp.capacity, 1);
    assert.equal(sp.get(0), undefined); // empty query -> undefined, no throw
});

// --- fail-closed doors (typeof-first: the [lite-logn] tag is exercised) ------

test('doors: key / value / bound coercion all fail closed with the [lite-logn] tag', () => {
    const sp = new SplayTree(8);
    for (const bad of [NaN, Infinity, -Infinity, '5', null, undefined, {}, Symbol('k'), 3n]) {
        assert.throws(() => sp.get(bad), /\[lite-logn\]/);
        assert.throws(() => sp.has(bad), /\[lite-logn\]/);
        assert.throws(() => sp.set(bad, 1), /\[lite-logn\]/);
        assert.throws(() => sp.delete(bad), /\[lite-logn\]/);
        assert.throws(() => sp.successor(bad), /\[lite-logn\]/);
        assert.throws(() => sp.predecessor(bad), /\[lite-logn\]/);
    }
    for (const bad of [NaN, Infinity, -Infinity, '5', null, undefined, {}, Symbol('v'), 3n]) {
        assert.throws(() => sp.set(0, bad), /\[lite-logn\]/);
    }
    assert.equal(sp.size, 0, 'a rejected door is a no-op (no ghost node)');
    for (const bad of [NaN, '0', null, undefined, {}, Symbol('b'), 3n]) {
        assert.throws(() => sp.rangeIter(bad, 5), /\[lite-logn\]/);
        assert.throws(() => sp.rangeIter(0, bad), /\[lite-logn\]/);
    }
    assert.throws(() => sp.rangeIter(5, 2), /\[lite-logn\]/, 'lo > hi');
    assert.doesNotThrow(() => [...sp.rangeIter(-Infinity, Infinity)], '+-Infinity are legal unbounded ends');
});

test('doors: a full pool fails closed on insert (never a silent drop)', () => {
    const sp = new SplayTree(2);
    sp.set(1, 10); sp.set(2, 20);
    assert.throws(() => sp.set(3, 30), /\[lite-logn\]/);
    assert.equal(sp.size, 2);
    // updating an EXISTING key on a full tree still works (no new node)
    assert.doesNotThrow(() => sp.set(1, 99));
    assert.equal(sp.get(1), 99);
});

// --- set / get / update-in-place --------------------------------------------

test('set/get: insert, read back, update in place (size steady), missing -> undefined', () => {
    const sp = new SplayTree(16);
    assert.equal(sp.set(5, 50), sp, 'set is fluent -> this');
    sp.set(3, 30); sp.set(9, 90); sp.set(1, 10); sp.set(7, 70);
    assert.equal(sp.size, 5);
    assert.equal(sp.get(5), 50);
    assert.equal(sp.get(1), 10);
    assert.equal(sp.get(4), undefined); // absent
    // update in place: no new node, value replaced
    sp.set(5, 55);
    assert.equal(sp.size, 5, 'update must not grow the tree');
    assert.equal(sp.get(5), 55);
    assertInvariants(sp);
});

// --- the SPLAY contract -----------------------------------------------------

test('splay: get / has move the touched key to the ROOT and bump the version', () => {
    const sp = new SplayTree(64);
    for (let k = 0; k < 32; k++) sp.set(k, k * 10);
    for (const probe of [0, 15, 31, 7, 20]) {
        const v0 = sp._version;
        assert.equal(sp.get(probe), probe * 10);
        assert.equal(sp._key[sp._root], probe, 'get must splay ' + probe + ' to the root');
        assert.notEqual(sp._version, v0, 'get must bump the version (a read restructures)');
        assertInvariants(sp);
    }
    const v1 = sp._version;
    assert.equal(sp.has(20), true);
    assert.equal(sp._key[sp._root], 20, 'has must splay to the root');
    assert.notEqual(sp._version, v1, 'has must bump the version');
});

test('splay: a MISSING key splays the CLOSEST node (pred or succ) to the root', () => {
    const sp = new SplayTree(64);
    for (let k = 0; k < 40; k += 2) sp.set(k, k); // even keys 0..38
    assert.equal(sp.get(21), undefined);
    const rootKey = sp._key[sp._root];
    assert.ok(rootKey === 20 || rootKey === 22, 'a missing key splays its predecessor or successor up, got ' + rootKey);
    assertInvariants(sp);
});

test('splay: successor / predecessor are STRICT and splay the closest node up + bump version', () => {
    const sp = new SplayTree(64);
    for (let k = 0; k < 20; k++) sp.set(k * 3, k * 3); // 0,3,6,...,57
    // strict successor / predecessor
    assert.equal(sp.successor(6), 9);
    assert.equal(sp.predecessor(6), 3);
    assert.equal(sp.successor(7), 9);     // key absent
    assert.equal(sp.predecessor(7), 6);
    assert.equal(sp.successor(57), undefined); // past the max
    assert.equal(sp.predecessor(0), undefined); // below the min
    const v0 = sp._version;
    sp.successor(30);
    assert.notEqual(sp._version, v0, 'successor must bump the version (it splays)');
    assertInvariants(sp);
});

test('non-splaying reads: rangeIter / forEach / iterator leave _root + _version byte-identical', () => {
    const sp = new SplayTree(64);
    for (let k = 0; k < 30; k++) sp.set(k, k);
    const rootBefore = sp._root, verBefore = sp._version;
    const via = [];
    sp.forEach((k) => via.push(k));
    assert.equal(sp._root, rootBefore, 'forEach must not splay (root unchanged)');
    assert.equal(sp._version, verBefore, 'forEach must not bump the version');
    const iter = [...sp];
    assert.equal(sp._root, rootBefore, 'Symbol.iterator must not splay');
    assert.equal(sp._version, verBefore, 'Symbol.iterator must not bump the version');
    const range = [...sp.rangeIter(5, 20)];
    assert.equal(sp._root, rootBefore, 'rangeIter must not splay');
    assert.equal(sp._version, verBefore, 'rangeIter must not bump the version');
    // ascending order + correct contents
    const expect = Array.from({ length: 30 }, (_, i) => i);
    assert.deepEqual(via, expect, 'forEach ascending');
    assert.deepEqual(iter, expect, 'iterator ascending');
    assert.deepEqual(range, expect.filter((k) => k >= 5 && k <= 20), 'rangeIter [5,20] inclusive');
});

// A2, hardened: the test above roots the tree at the MAX key (the last ascending insert),
// which is also the LAST key any of the three walks visits -- a stray splay of the final
// visited node would coincidentally leave _root unchanged and slip through undetected. Root
// the tree at an ARBITRARY MIDDLE key first (so no walk's start/end key already IS the root),
// over a LARGE key set (5000), and check _root/_version after EVERY few steps, not just at
// the end -- so a splay anywhere along the walk (not only at the boundaries) is caught.
test('A2 (hardened): forEach / rangeIter / iterator perform ZERO splays over a large key set, ' +
    'checked mid-walk (not just before/after) so a stray splay anywhere is caught', () => {
    const N = 5000;
    const sp = new SplayTree(N);
    for (let k = 0; k < N; k++) sp.set(k, k);
    sp.get(2500); // re-root at an ARBITRARY MIDDLE key -- neither the min nor the max
    const rootBefore = sp._root, verBefore = sp._version;
    assert.equal(sp._key[rootBefore], 2500);

    let seen = 0;
    sp.forEach((k) => {
        seen++;
        if ((seen & 511) === 0) { // spot-check mid-walk, not only at the very end
            assert.equal(sp._root, rootBefore, 'forEach must not splay at key ' + k + ' (mid-walk check)');
            assert.equal(sp._version, verBefore, 'forEach must not bump version at key ' + k);
        }
    });
    assert.equal(seen, N);
    assert.equal(sp._root, rootBefore, 'forEach must leave _root byte-identical (large key set)');
    assert.equal(sp._version, verBefore, 'forEach must leave _version byte-identical (large key set)');

    const iter = [...sp];
    assert.equal(iter.length, N);
    assert.equal(sp._root, rootBefore, 'Symbol.iterator must leave _root byte-identical (large key set)');
    assert.equal(sp._version, verBefore, 'Symbol.iterator must leave _version byte-identical (large key set)');

    const range = [...sp.rangeIter(-Infinity, Infinity)];
    assert.equal(range.length, N);
    assert.equal(sp._root, rootBefore, 'rangeIter must leave _root byte-identical (large key set)');
    assert.equal(sp._version, verBefore, 'rangeIter must leave _version byte-identical (large key set)');
});

test('re-entrancy: any mutation mid-rangeIter throws [lite-logn] -- INCLUDING a get (reads splay)', () => {
    const sp = new SplayTree(64);
    for (let k = 0; k < 20; k++) sp.set(k, k);
    // a get during iteration (a read that splays) must fail the version stamp
    assert.throws(() => { for (const k of sp.rangeIter(0, 19)) { void k; sp.get(0); } }, /mutated during iteration/);
    // so must a structural set
    assert.throws(() => { for (const k of sp.rangeIter(0, 19)) { void k; sp.set(100, 1); } }, /mutated during iteration/);
    // a clean full consume does NOT throw
    assert.doesNotThrow(() => { for (const k of sp.rangeIter(0, 19)) void k; });
});

// --- delete / join ----------------------------------------------------------

test('delete: idempotent, joins subtrees, preserves order, frees the slot', () => {
    const sp = new SplayTree(64);
    for (let k = 0; k < 30; k++) sp.set(k, k * 2);
    assert.equal(sp.delete(100), false, 'absent delete -> false (no throw)');
    assert.equal(sp.delete(15), true);
    assert.equal(sp.delete(15), false, 'second delete of the same key -> false');
    assert.equal(sp.size, 29);
    assert.equal(sp.get(15), undefined);
    assert.equal(sp.get(14), 28, 'neighbour survives the join');
    assert.equal(sp.get(16), 32, 'neighbour survives the join');
    assertInvariants(sp);
    // delete the root (min) and the max repeatedly
    for (let k = 0; k < 30; k++) { sp.delete(k); assertInvariants(sp); }
    assert.equal(sp.size, 0);
    assert.equal(sp._root, 0, 'an emptied tree points root at NIL');
});

test('delete: removing the whole tree in random order keeps invariants + conservation', () => {
    const sp = new SplayTree(200);
    const rnd = mulberry32(777);
    const keys = [];
    for (let k = 0; k < 150; k++) { sp.set(k, k); keys.push(k); }
    for (let i = keys.length - 1; i > 0; i--) { const j = (rnd() * (i + 1)) | 0; const t = keys[i]; keys[i] = keys[j]; keys[j] = t; }
    for (const k of keys) { assert.equal(sp.delete(k), true); assertInvariants(sp); }
    assert.equal(sp.size, 0);
    assert.ok(conserved(sp));
});

// --- clear + reuse ----------------------------------------------------------

test('clear: empties, restores the free-list, and leaves the tree reusable', () => {
    const sp = new SplayTree(32);
    for (let k = 0; k < 32; k++) sp.set(k, k);
    assert.equal(sp.size, 32);
    assert.equal(sp.clear(), sp, 'clear is fluent -> this');
    assert.equal(sp.size, 0);
    assert.equal(sp._root, 0);
    assert.ok(conserved(sp));
    // reusable: a full refill to capacity succeeds (a leaked free-list would overflow)
    for (let k = 0; k < 32; k++) sp.set(k + 100, k);
    assert.equal(sp.size, 32);
    assertInvariants(sp);
});

// --- differential fuzz vs an independent Map + sorted oracle -----------------

test('fuzz: >= 1e5 mixed ops vs an independent Map + sorted oracle, 0 divergences', () => {
    const CAP = 4000;
    const sp = new SplayTree(CAP);
    const oracle = new Map();
    const U = 1500;
    const rnd = mulberry32(0xBEEF);
    for (let step = 0; step < 120000; step++) {
        const r = rnd();
        const k = (rnd() * U) | 0;
        if (r < 0.42) {                     // set
            if (!oracle.has(k) && oracle.size >= CAP) continue;
            const v = (rnd() * 1e6) | 0;
            sp.set(k, v); oracle.set(k, v);
        } else if (r < 0.64) {              // delete
            assert.equal(sp.delete(k), oracle.delete(k), 'delete parity at ' + k);
        } else if (r < 0.80) {              // get
            assert.equal(sp.get(k), oracle.has(k) ? oracle.get(k) : undefined, 'get parity at ' + k);
        } else if (r < 0.88) {              // has
            assert.equal(sp.has(k), oracle.has(k), 'has parity at ' + k);
        } else if (r < 0.94) {              // successor
            let best;
            for (const kk of oracle.keys()) if (kk > k && (best === undefined || kk < best)) best = kk;
            assert.equal(sp.successor(k), best, 'successor parity at ' + k);
        } else {                            // predecessor
            let best;
            for (const kk of oracle.keys()) if (kk < k && (best === undefined || kk > best)) best = kk;
            assert.equal(sp.predecessor(k), best, 'predecessor parity at ' + k);
        }
        assert.equal(sp.size, oracle.size, 'size parity');
        assert.ok(conserved(sp), 'conservation');
        assert.ok(nilClean(sp), 'NIL header clean');
    }
    // final full-structure equality: ascending keys + values match the sorted oracle
    const sorted = [...oracle.keys()].sort((a, b) => a - b);
    assert.deepEqual([...sp], sorted, 'iterator must match the sorted oracle keys');
    let i = 0;
    sp.forEach((k, v) => { assert.equal(k, sorted[i], 'forEach key ' + i); assert.equal(v, oracle.get(k), 'forEach value'); i++; });
    assert.equal(i, oracle.size, 'forEach visited every key');
    // rangeIter over a window matches
    const lo = 300, hi = 900;
    assert.deepEqual([...sp.rangeIter(lo, hi)], sorted.filter((k) => k >= lo && k <= hi), 'rangeIter window');
    // one final invariant sweep
    assert.equal(checkBst(sp, sp._root, -Infinity, Infinity), sp.size);
});

// --- the working-set win (self-adjusting: hot keys ride near the root) -------

test('working set: repeatedly accessed keys settle near the root (the splay payoff)', () => {
    const sp = new SplayTree(2048);
    for (let k = 0; k < 2000; k++) sp.set(k, k);
    // hammer a small hot set; each get splays its key to the root
    const hot = [3, 100, 777, 1500];
    for (let r = 0; r < 200; r++) for (const h of hot) sp.get(h);
    // the LAST accessed hot key is the root; the others sit shallow (near the top)
    assert.equal(sp._key[sp._root], hot[hot.length - 1], 'last hot access is the root');
    // depth of each hot key is small relative to the tree size (a balanced 2000-node tree is
    // ~11 deep; the hot set, kept warm, must sit well within a small constant of the root)
    const depthOf = (key) => {
        let t = sp._root, d = 0;
        while (t !== 0) { const kt = sp._key[t]; if (key === kt) return d; t = key < kt ? sp._left[t] : sp._right[t]; d++; }
        return -1;
    };
    for (const h of hot) assert.ok(depthOf(h) >= 0 && depthOf(h) <= 8, 'hot key ' + h + ' must ride shallow, got depth ' + depthOf(h));
    assertInvariants(sp);
});

// --- A5: the locality claim is REAL, measured (not merely asserted) ---------

test('locality: a working-set trace is MEASURABLY cheaper than a uniform-random trace', () => {
    const N = 8192;
    const sp = new SplayTree(N);
    for (let k = 0; k < N; k++) sp.set(k, k);
    const HOT = [3, 100, 777, 1500, 4096, 6000];
    // shuffled uniform-random permutation of every resident key
    const rnd = mulberry32(0xC0FFEE);
    const uni = new Int32Array(N);
    for (let i = 0; i < N; i++) uni[i] = i;
    for (let i = N - 1; i > 0; i--) { const j = (rnd() * (i + 1)) | 0; const t = uni[i]; uni[i] = uni[j]; uni[j] = t; }

    const ITERS = 200000;
    function timeTrace(pick) {
        let sink = 0;
        for (let i = 0; i < ITERS; i++) sink += sp.get(pick(i)); // warm
        let best = Infinity;
        for (let b = 0; b < 7; b++) {
            const t0 = process.hrtime.bigint();
            for (let i = 0; i < ITERS; i++) sink += sp.get(pick(i));
            const e = Number(process.hrtime.bigint() - t0) / ITERS;
            if (e < best) best = e;
        }
        if (sink < 0) throw new Error('unreachable');
        return best;
    }
    const workingSetNs = timeTrace((i) => HOT[i % HOT.length]);
    const uniformNs = timeTrace((i) => uni[i % N]);
    assert.ok(workingSetNs < uniformNs * 0.5,
        'a hot working set (splay keeps it near the root) must be measurably (>=2x) cheaper ' +
        'than a uniform-random trace over the whole tree, got working=' + workingSetNs.toFixed(2) +
        'ns vs uniform=' + uniformNs.toFixed(2) + 'ns');
});

// --- reviewer nit 1: full-pool set() splays-and-throws WITHOUT bumping _version ---
// (LogN.js ~3029). Adversarial case: an in-flight rangeIter, then a set() on a FULL
// pool that splays (a real structural mutation: _root moves) then throws before the
// version bump, then continued iteration. Verdict under test: rangeIter/forEach never
// cache node SLOT identity across steps -- _succNode/_ceilNode re-descend the CURRENT
// tree by KEY VALUE each step -- and a full-pool set() rejects the insert (no node
// added, freed, or overwritten), so the key set and its sorted order are byte-for-byte
// unchanged. A pure re-shape (rotations only) is therefore INVISIBLE to a key-based
// walk: the iterator must silently finish with the exact correct sorted sequence, even
// though the un-bumped version fails to trip the "mutated during iteration" guard.
test('nit-1: full-pool set() splays+throws mid-rangeIter WITHOUT bumping _version, yet ' +
    'the in-flight iterator still yields the exact correct sorted sequence (benign, non-corrupting)', () => {
    const sp = new SplayTree(4);
    sp.set(10, 1); sp.set(20, 2); sp.set(30, 3); sp.set(40, 4); // full: 4/4
    sp.get(10); // splay 10 to root, so root is provably NOT already the max (40)
    assert.equal(sp._key[sp._root], 10);

    const verBefore = sp._version;
    const rootBefore = sp._root;
    const it = sp.rangeIter(-Infinity, Infinity);
    const out = [it.next().value]; // consume the first key (10) before the mutation

    let threw = false;
    try { sp.set(999, 999); } catch (e) { threw = true; }
    assert.ok(threw, 'set on a full pool must still throw [lite-logn]');
    assert.notEqual(sp._root, rootBefore, 'the full-pool set DID splay -- root moved (a real structural mutation)');
    assert.equal(sp._version, verBefore, 'the throw path does NOT bump _version (the exact nit)');
    assert.equal(sp._key[sp._root], 40, 'splay(999) walked the max (40) to the root');

    assert.doesNotThrow(() => { for (const v of it) out.push(v); },
        'a pure re-shape with an UNCHANGED key set must not corrupt the in-flight walk');
    assert.deepEqual(out, [10, 20, 30, 40], 'the iterator must still yield the exact sorted key set');
    assertInvariants(sp);
});

// randomized differential version of the same nit-1 adversarial case: many tree
// shapes/sizes, a random stop point mid-iteration, a random root before the mutating
// full-pool set(), then the remainder of the walk must exactly match the sorted keys.
test('nit-1 (fuzz): the full-pool splay-and-throw gap never corrupts an in-flight rangeIter, 500 trials', () => {
    const rnd = mulberry32(0x51DE1);
    for (let trial = 0; trial < 500; trial++) {
        const N = 20 + ((rnd() * 60) | 0);
        const sp = new SplayTree(N);
        const keys = [];
        for (let i = 0; i < N; i++) { const k = i * 10; sp.set(k, k); keys.push(k); }
        sp.get(keys[(rnd() * N) | 0]); // randomize the root
        const it = sp.rangeIter(-Infinity, Infinity);
        const out = [];
        const stopAt = 1 + ((rnd() * (N - 1)) | 0);
        for (let i = 0; i < stopAt; i++) out.push(it.next().value);
        assert.throws(() => sp.set(-1 - trial, 1), /\[lite-logn\]/, 'trial ' + trial + ' full pool must throw');
        assert.doesNotThrow(() => { for (const v of it) out.push(v); }, 'trial ' + trial);
        assert.deepEqual(out, keys, 'trial ' + trial + ' full sequence must match the sorted key set');
    }
});

// --- reviewer nit 2: split/merge absence is proven at RUNTIME even without a ------
// dedicated type-level probe (types/logn.test-d.ts only covers rank/select today).
test('nit-2: split/merge absence is proven at runtime (QaAudit-style, LEAN member)', () => {
    const sp = new SplayTree(8);
    assert.equal(typeof sp.split, 'undefined', 'no instance split (LEAN)');
    assert.equal(typeof sp.merge, 'undefined', 'no instance merge (LEAN)');
    assert.equal(typeof SplayTree.split, 'undefined', 'no static split (LEAN)');
    assert.equal(typeof SplayTree.merge, 'undefined', 'no static merge (LEAN)');
});

// --- boundary matrix: 0 / 1 / N-1 / N / N+1 -----------------------------------

test('boundary: capacity 1 (N=1) accepts exactly one entry, the (N+1)-th throws', () => {
    const sp = new SplayTree(1);
    assert.equal(sp.set(5, 50), sp);
    assert.equal(sp.size, 1);
    assert.throws(() => sp.set(6, 60), /\[lite-logn\]/, 'the 2nd distinct key on a 1-capacity tree');
    assert.equal(sp.get(5), 50, 'the resident key still reads back after the rejected insert');
});

test('boundary: N-1 fills succeed, the N-th fill succeeds, the (N+1)-th throws', () => {
    const N = 16;
    const sp = new SplayTree(N);
    for (let k = 0; k < N - 1; k++) assert.doesNotThrow(() => sp.set(k, k), 'fill ' + k + '/' + (N - 1));
    assert.equal(sp.size, N - 1, 'N-1 fills leave one free slot');
    assert.doesNotThrow(() => sp.set(N - 1, N - 1), 'the N-th fill reaches exact capacity');
    assert.equal(sp.size, N);
    assert.throws(() => sp.set(N, N), /\[lite-logn\]/, 'the (N+1)-th distinct key must throw (full)');
    assert.equal(sp.size, N, 'a rejected insert never grows past capacity');
    assertInvariants(sp);
});

test('boundary: 0 capacity throws at construction (not a legal empty tree)', () => {
    assert.throws(() => new SplayTree(0), /\[lite-logn\]/);
});

test('boundary: empty tree -- every query is undefined/false, no throw, rangeIter/forEach are no-ops', () => {
    const sp = new SplayTree(8);
    assert.equal(sp.get(0), undefined);
    assert.equal(sp.has(0), false);
    assert.equal(sp.delete(0), false);
    assert.equal(sp.successor(0), undefined);
    assert.equal(sp.predecessor(0), undefined);
    assert.deepEqual([...sp.rangeIter(-Infinity, Infinity)], []);
    let calls = 0;
    sp.forEach(() => calls++);
    assert.equal(calls, 0);
    assert.deepEqual([...sp], []);
    assertInvariants(sp);
});

test('boundary: -0 as a key behaves as ordinary 0 (IEEE-754 equality, not Object.is)', () => {
    const sp = new SplayTree(8);
    sp.set(-0, 111);
    assert.equal(sp.get(0), 111, 'set(-0, ...) must read back under get(0)');
    assert.equal(sp.get(-0), 111);
    assert.equal(sp.has(-0), true);
    // assert.equal (node:assert/strict) uses Object.is, which DISTINGUISHES -0 from 0 --
    // but the SplayTree's own key comparisons (< / > / ===) do NOT, so the tree may
    // legitimately hand back the exact -0 it stored (Float64Array preserves the sign
    // bit). Use plain === (which treats -0 === 0) to assert the KEY-EQUALITY contract,
    // not bitwise identity of the returned zero.
    assert.ok(sp.successor(-1) === 0, 'successor(-1) must be (loosely) 0, got ' + sp.successor(-1));
    assert.ok(sp.predecessor(1) === 0, 'predecessor(1) must be (loosely) 0, got ' + sp.predecessor(1));
    sp.set(0, 222); // same key as -0: update in place, no new node
    assert.equal(sp.size, 1, '-0 and 0 are the SAME key (no ghost second node)');
    assert.equal(sp.get(-0), 222);
    assertInvariants(sp);
});

// --- boundary matrix: duplicate dispose / dispose-during-iteration / re-entrant --

test('boundary: duplicate dispose -- clear() twice in a row, and delete() twice on the same key, are both safe no-ops', () => {
    const sp = new SplayTree(16);
    for (let k = 0; k < 16; k++) sp.set(k, k);
    assert.equal(sp.delete(5), true);
    assert.equal(sp.delete(5), false, 'a second delete of the same key is a safe no-op');
    assert.equal(sp.delete(5), false, 'a third delete of the same key is still a safe no-op');
    assert.ok(conserved(sp));
    sp.clear();
    assert.equal(sp.size, 0);
    assert.doesNotThrow(() => sp.clear(), 'clear() on an already-empty tree is a safe no-op');
    assert.equal(sp.clear(), sp, 'double clear() stays fluent');
    assert.ok(conserved(sp), 'conservation holds after a duplicate clear()');
    // reusable after the duplicate dispose
    for (let k = 0; k < 16; k++) sp.set(k + 50, k);
    assert.equal(sp.size, 16);
    assertInvariants(sp);
});

test('boundary: dispose-during-iteration -- clear() mid-rangeIter throws [lite-logn], and the tree ' +
    'is left in a clean, reusable state afterward', () => {
    const sp = new SplayTree(32);
    for (let k = 0; k < 32; k++) sp.set(k, k);
    assert.throws(() => {
        for (const k of sp.rangeIter(0, 31)) { void k; sp.clear(); }
    }, /mutated during iteration/, 'a clear() mid-iteration must fail closed, not yield stale keys');
    assert.equal(sp.size, 0, 'the clear() itself still took effect');
    assert.ok(conserved(sp));
    // the tree is reusable after a disposed-mid-iteration abort
    for (let k = 0; k < 32; k++) sp.set(k + 100, k);
    assert.equal(sp.size, 32);
    assertInvariants(sp);
});

test('re-entrant write: a set() issued from inside forEach\'s (non-version-stamped) callback ' +
    'does not corrupt the tree -- forEach is documented as the caller\'s responsibility, not fail-closed', () => {
    const sp = new SplayTree(64);
    for (let k = 0; k < 20; k++) sp.set(k * 2, k); // even keys 0..38
    let calls = 0;
    assert.doesNotThrow(() => {
        sp.forEach((k) => {
            calls++;
            if (k === 10) sp.set(10, 999); // re-entrant write: update the CURRENT key's value in place
        });
    });
    assert.ok(calls > 0);
    assert.equal(sp.get(10), 999, 'the re-entrant in-place update took effect');
    assertInvariants(sp);
});

// --- adversarial case (planner did not consider): two concurrently in-flight -----
// iterators, captured at DIFFERENT versions straddling a real mutation. The OLDER
// iterator's captured version must fail closed on its very next step; a FRESH
// iterator opened AFTER the mutation must see the post-mutation key set and must
// NOT be tripped by the older iterator's failure.
test('adversarial: two concurrent iterators at different captured versions -- the stale one ' +
    'fails closed, a freshly-opened one is unaffected and sees the post-mutation keys', () => {
    const sp = new SplayTree(32);
    for (let k = 0; k < 20; k++) sp.set(k, k);
    const staleIter = sp.rangeIter(-Infinity, Infinity);
    assert.equal(staleIter.next().value, 0); // pins staleIter's captured version

    sp.set(999, 999); // a real structural + version-bumping mutation

    const freshIter = sp.rangeIter(-Infinity, Infinity); // captures the NEW version
    const freshOut = [...freshIter];
    const expected = Array.from({ length: 20 }, (_, i) => i).concat([999]).sort((a, b) => a - b);
    assert.deepEqual(freshOut, expected, 'a freshly-opened iterator must see the post-mutation key set');

    assert.throws(() => staleIter.next(), /mutated during iteration/,
        'the STALE iterator (opened before the mutation) must fail closed on its next step');
    assertInvariants(sp);
});
