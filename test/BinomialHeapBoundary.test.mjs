/**
 * @zakkster/lite-logn -- BinomialHeap QA boundary + own-hunt suite.
 *
 * Rounds out test/BinomialHeap.test.mjs with:
 *   - a white-box structural checker (root-order distinctness, subtree size ==
 *     2^order, heap-order, cached _min == an independent brute root rescan)
 *     run after EVERY op of a mixed push/popMin/meld fuzz;
 *   - a differential fuzz vs a sorted-array multiset oracle WITH interleaved
 *     melds across a 3-heap arena;
 *   - the explicit binary-carry "three trees of equal order" case, in both
 *     push (ripple carry) and meld (list-vs-list collision);
 *   - own-hunt: empty-operand melds (both directions), meld then continued
 *     heavy use, popMin-to-empty-then-push _min recovery, uneven arena
 *     draining conservation, full-pool-throws-with-no-orphaned-slot,
 *     arena(count=1), and an adversarial re-entrant mutation during forEach.
 */

import test from 'node:test';
import assert from 'node:assert/strict';
import { BinomialHeap } from '../LogN.js';

function mulberry32(seed) {
    let s = seed >>> 0;
    return function () {
        s = (s + 0x6D2B79F5) | 0;
        let t = Math.imul(s ^ (s >>> 15), s | 1);
        t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
        return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
}

// --- white-box structural checker (independent of the private _scanMin) ----

/** Recursively verify subtree `node`: child count == order, subtree size ==
 * 2^order, and heap-order holds on every parent/child edge. Returns the
 * subtree's node count. */
function checkSubtree(h, node) {
    const K = h._key, C = h._child, S = h._sibling, O = h._order, isMin = h._isMin;
    let size = 1, kids = 0;
    let c = C[node];
    while (c !== 0) {
        kids++;
        assert.ok(isMin ? K[node] <= K[c] : K[node] >= K[c],
            'heap-order violated at slot ' + node + ' -> child ' + c);
        size += checkSubtree(h, c);
        c = S[c];
    }
    assert.equal(kids, O[node], 'child count must equal order at slot ' + node);
    assert.equal(size, 1 << O[node], 'subtree size must be 2^order at slot ' + node);
    return size;
}

/** Full structural check: root orders strictly increase (no duplicates), every
 * root's subtree obeys checkSubtree, total size == h.size, and the cached
 * `_min` equals an INDEPENDENT brute root-list rescan (never calling the
 * private `_scanMin`). Call after every mutating op to prove A1/A4. */
function checkHeap(h) {
    const K = h._key, S = h._sibling, O = h._order, isMin = h._isMin;
    let total = 0, best = 0, lastOrder = -1;
    let r = h._head;
    while (r !== 0) {
        assert.ok(O[r] > lastOrder, 'root orders must strictly increase (found ' + O[r] + ' after ' + lastOrder + ')');
        lastOrder = O[r];
        total += checkSubtree(h, r);
        if (best === 0 || (isMin ? K[r] < K[best] : K[r] > K[best])) best = r;
        r = S[r];
    }
    assert.equal(total, h._n, 'sum of root subtree sizes must equal h.size');
    if (h._n === 0) {
        assert.equal(h._min, 0, 'empty heap _min must be NIL (0)');
    } else {
        assert.equal(K[h._min], K[best],
            'cached _min key must equal an independent brute root-list rescan');
    }
}

// --- A1: structural invariant + _min-cache after EVERY op (incl. meld) -----

test('A1 structural: root-order distinctness, 2^order subtree size, heap-order, and _min-cache hold after EVERY op (incl. meld)', () => {
    for (const kind of ['min', 'max']) {
        const CAP = 600;
        const DONORS = 100; // a meld CONSUMES its donor forever -- never reuse one
        const arena = BinomialHeap.arena(CAP, kind, 1 + DONORS);
        const a = arena[0];
        let donorIdx = 1;
        const rnd = mulberry32(0xA11CE ^ (kind === 'min' ? 1 : 2));
        let nextId = 0;
        for (let op = 0; op < 4000; op++) {
            const choice = rnd();
            if (choice < 0.02 && donorIdx <= DONORS && a.size < CAP - 50) {
                // occasional meld: push a handful into a FRESH donor, then fold it into a.
                const donor = arena[donorIdx++];
                const cnt = 1 + ((rnd() * 20) | 0);
                for (let k = 0; k < cnt && a.size + k < CAP; k++) {
                    donor.push(nextId++ & 0xffff, (rnd() * 1e6) | 0);
                }
                a.meld(donor);
                checkHeap(a);
                assert.equal(donor.size, 0, 'meld leaves donor empty');
            } else if (choice < 0.55 && a.size < CAP) {
                a.push(nextId++ & 0xffff, (rnd() * 1e6) | 0);
                checkHeap(a);
            } else if (a.size > 0) {
                a.popMin();
                checkHeap(a);
            }
        }
        // Drain fully, checking structure at every step down to empty.
        while (a.size > 0) { a.popMin(); checkHeap(a); }
        assert.equal(a._min, 0);
    }
});

// --- differential fuzz vs a sorted-array oracle, interleaved melds ---------

test('differential fuzz: N-heap arena vs sorted-array multiset oracles, interleaved melds (min kind)', () => {
    const CAP = 3000;
    const SPARE = 400; // a meld CONSUMES the source forever -- each merge needs a fresh identity
    const heaps = BinomialHeap.arena(CAP, 'min', 3 + SPARE);
    const models = new Map([[0, []], [1, []], [2, []]]); // sorted ascending arrays, keyed by heap index
    let alive = [0, 1, 2];
    let nextSpare = 3;
    const rnd = mulberry32(0xF00D5);
    let nextId = 0;
    const insertSorted = (arr, v) => {
        let lo = 0, hi = arr.length;
        while (lo < hi) { const mid = (lo + hi) >> 1; if (arr[mid] < v) lo = mid + 1; else hi = mid; }
        arr.splice(lo, 0, v);
    };
    for (let op = 0; op < 20000; op++) {
        const which = alive[(rnd() * alive.length) | 0];
        const h = heaps[which], model = models.get(which);
        const r = rnd();
        if (r < 0.05 && alive.length > 1 && nextSpare < heaps.length) {
            // meld `which` into a DIFFERENT alive heap, `which` is retired and a
            // fresh spare identity takes its place in `alive` (so future picks
            // never touch a consumed heap).
            let dstIdx = (rnd() * alive.length) | 0;
            if (alive[dstIdx] === which) dstIdx = (dstIdx + 1) % alive.length;
            const dst = alive[dstIdx];
            heaps[dst].meld(h);
            const dm = models.get(dst);
            for (const v of model) insertSorted(dm, v);
            model.length = 0; // the retired heap's model must reflect its now-empty heap too
            models.delete(which);
            alive = alive.filter((x) => x !== which);
            const freshIdx = nextSpare++;
            models.set(freshIdx, []);
            alive.push(freshIdx);
            assert.equal(h.size, 0, 'melded-away heap is empty');
        } else if (r < 0.55 && h.size < CAP - 100) {
            const key = (rnd() * 1e6) | 0;
            h.push(nextId++ & 0xffff, key);
            insertSorted(model, key);
        } else if (model.length > 0) {
            assert.equal(h.peekMinKey(), model[0], 'peekMinKey diverges from oracle at op ' + op);
            h.popMin();
            model.shift();
        }
        assert.equal(h.size, model.length, 'size diverges from oracle at op ' + op);
    }
    for (const i of alive) {
        const model = models.get(i), h = heaps[i];
        assert.equal(h.size, model.length);
        while (h.size > 0) {
            assert.equal(h.peekMinKey(), model[0]);
            h.popMin();
            model.shift();
        }
    }
});

// --- the binary-carry "three trees of equal order" case --------------------

test('binary carry: three trees of equal order collapse correctly (push ripple AND meld list-collision)', () => {
    // push ripple: 2^k-1 -> 2^k -> 2^k+1 crosses every carry depth at once.
    for (const n of [7, 8, 9, 15, 16, 17, 31, 32, 33]) {
        const h = new BinomialHeap(64, 'min');
        for (let i = 0; i < n; i++) h.push(i, (i * 2654435761) & 0xffff);
        checkHeap(h);
        assert.equal(h.size, n);
    }
    // meld list-collision: two heaps each built from 3 pushes (binary 011 ->
    // root orders {0,1}) meld into a single order-2 tree PLUS a leftover
    // order-1 tree via the classic "three order-1 roots in a row" collapse
    // (o0(A)+o0(B) carries to a NEW order-1 root sitting beside A's and B's
    // existing order-1 roots -- exactly the ambiguous triple the lookahead
    // guard in _unionInto exists to resolve).
    const [a, b] = BinomialHeap.arena(64, 'min', 2);
    for (let i = 0; i < 3; i++) a.push(i, 100 + i);
    for (let i = 0; i < 3; i++) b.push(10 + i, 200 + i);
    a.meld(b);
    checkHeap(a);
    assert.equal(a.size, 6);
    const drained = [];
    while (a.size > 0) drained.push(a.popMin());
    assert.equal(drained.length, 6);
});

// --- own-hunt (a): meld with an EMPTY operand, both directions -------------

test('own-hunt: meld with an EMPTY operand (either side) is a correct no-op union, no _min corruption', () => {
    // b (donor) empty, a nonempty.
    {
        const [a, b] = BinomialHeap.arena(64, 'min', 2);
        for (let i = 0; i < 10; i++) a.push(i, (i * 37 + 3) % 97);
        const beforeMin = a.peekMinKey();
        const ret = a.meld(b);
        assert.equal(ret, a);
        assert.equal(a.size, 10);
        assert.equal(a.peekMinKey(), beforeMin, 'melding an empty donor must not change _min');
        assert.equal(b.size, 0, 'the (already empty) donor is still consumed/dead');
        assert.throws(() => b.push(0, 0), /\[lite-logn\]/, 'empty donor is STILL consumed after the meld');
        checkHeap(a);
    }
    // a (receiver) empty, b nonempty.
    {
        const [a, b] = BinomialHeap.arena(64, 'min', 2);
        for (let i = 0; i < 10; i++) b.push(i, (i * 53 + 7) % 97);
        const expectedMin = b.peekMinKey();
        const ret = a.meld(b);
        assert.equal(ret, a);
        assert.equal(a.size, 10);
        assert.equal(a.peekMinKey(), expectedMin, 'an empty receiver must adopt the donor whole, incl. _min');
        assert.equal(b.size, 0);
        checkHeap(a);
        const drained = [];
        while (a.size > 0) drained.push(a.popMin());
        assert.equal(drained.length, 10);
    }
    // BOTH empty.
    {
        const [a, b] = BinomialHeap.arena(64, 'min', 2);
        const ret = a.meld(b);
        assert.equal(ret, a);
        assert.equal(a.size, 0);
        assert.equal(a.peekMin(), undefined);
        assert.equal(a.peekMinKey(), undefined);
        assert.equal(a.popMin(), undefined);
        checkHeap(a);
    }
});

// --- own-hunt (b): meld then continue using `a` heavily --------------------

test('own-hunt: meld then heavy continued push/popMin churn on the survivor stays correct', () => {
    const CAP = 2000;
    const [a, b] = BinomialHeap.arena(CAP, 'min', 2);
    const rnd = mulberry32(0xC0DE1);
    const model = [];
    const insertSorted = (v) => {
        let lo = 0, hi = model.length;
        while (lo < hi) { const mid = (lo + hi) >> 1; if (model[mid] < v) lo = mid + 1; else hi = mid; }
        model.splice(lo, 0, v);
    };
    for (let i = 0; i < 300; i++) { const v = (rnd() * 1e6) | 0; a.push(i, v); insertSorted(v); }
    for (let i = 0; i < 200; i++) { const v = (rnd() * 1e6) | 0; b.push(1000 + i, v); insertSorted(v); }
    a.meld(b);
    checkHeap(a);
    let nextId = 2000;
    for (let op = 0; op < 20000; op++) {
        if (rnd() < 0.5 && a.size < CAP) {
            const v = (rnd() * 1e6) | 0;
            a.push(nextId++ & 0x7fffffff, v);
            insertSorted(v);
        } else if (model.length > 0) {
            assert.equal(a.peekMinKey(), model[0]);
            a.popMin();
            model.shift();
        }
    }
    checkHeap(a);
    while (a.size > 0) { assert.equal(a.peekMinKey(), model[0]); a.popMin(); model.shift(); }
    assert.equal(model.length, 0);
});

// --- own-hunt (c): popMin down to empty then push again recovers _min ------

test('own-hunt: popMin to empty then push again recovers _min and structure', () => {
    for (const kind of ['min', 'max']) {
        const h = new BinomialHeap(32, kind);
        for (let i = 0; i < 10; i++) h.push(i, i * 3 + 1);
        while (h.size > 0) h.popMin();
        assert.equal(h.peekMin(), undefined);
        assert.equal(h._min, 0);
        assert.equal(h._head, 0);
        h.push(99, 42);
        assert.equal(h.peekMin(), 99);
        assert.equal(h.peekMinKey(), 42);
        checkHeap(h);
        h.push(100, kind === 'min' ? 1 : 1000);
        assert.equal(h.peekMinKey(), kind === 'min' ? 1 : 1000);
        checkHeap(h);
    }
});

// --- own-hunt (e): conservation holds when arena siblings drain unevenly ---

test('own-hunt: pool conservation holds when one arena sibling drains fully while another still holds nodes', () => {
    const cap = 500;
    const [a, b, c] = BinomialHeap.arena(cap, 'min', 3);
    for (let i = 0; i < 100; i++) a.push(i, i);
    for (let i = 0; i < 150; i++) b.push(100 + i, i);
    for (let i = 0; i < 80; i++) c.push(300 + i, i);
    assert.equal(a._pool.activeSlots, 330);
    // Drain `a` fully; b and c must be untouched, and the shared pool must
    // reflect exactly a's 100 freed slots.
    let drained = 0;
    while (a.size > 0) { a.popMin(); drained++; }
    assert.equal(drained, 100);
    assert.equal(a._pool.activeSlots, 230, 'only a\'s nodes were returned to the pool');
    assert.equal(a._pool.activeSlots + a._pool.freeListLength, cap);
    assert.equal(b.size, 150, 'sibling b untouched by a\'s drain');
    assert.equal(c.size, 80, 'sibling c untouched by a\'s drain');
    // a is now empty but still usable (not consumed -- draining is not disposal).
    a.push(999, -1);
    assert.equal(a.peekMin(), 999);
    checkHeap(a);
    assert.equal(a._pool.activeSlots, 231);
    assert.equal(a._pool.activeSlots + a._pool.freeListLength, cap);
});

// --- full-pool throws with no orphaned slot ---------------------------------

test('full arena throws with NO orphaned slot: pool stays exactly at capacity, a later pop+push recovers cleanly', () => {
    const cap = 16;
    const h = new BinomialHeap(cap, 'min');
    for (let i = 0; i < cap; i++) h.push(i, i);
    assert.equal(h._pool.activeSlots, cap);
    assert.equal(h._pool.freeListLength, 0);
    for (let i = 0; i < 5; i++) {
        assert.throws(() => h.push(1000 + i, 1000 + i), /\[lite-logn\]/);
        assert.equal(h._pool.activeSlots, cap, 'a failed push must not consume a slot');
        assert.equal(h._pool.freeListLength, 0);
        assert.equal(h.size, cap);
    }
    h.popMin();
    assert.equal(h._pool.activeSlots, cap - 1);
    assert.equal(h._pool.freeListLength, 1);
    h.push(2000, 2000);
    assert.equal(h._pool.activeSlots, cap);
    assert.equal(h._pool.freeListLength, 0);
    checkHeap(h);
});

// --- arena(count=1) is exactly the standalone case --------------------------

test('arena(capacity, kind, 1) behaves exactly like a standalone heap (own arena, melds with nothing else)', () => {
    const [solo] = BinomialHeap.arena(32, 'min', 1);
    for (let i = 0; i < 10; i++) solo.push(i, (i * 17) % 50);
    checkHeap(solo);
    assert.equal(solo.size, 10);
    const foreign = new BinomialHeap(32, 'min');
    assert.throws(() => solo.meld(foreign), /\[lite-logn\]/, 'a count=1 arena heap is still cross-arena vs a foreign standalone heap');
});

// --- boundary matrix: 0 / 1 / N-1 / N / N+1 on the arena count --------------

test('boundary: arena count 1, 2, and a larger N all share exactly one pool + column set', () => {
    for (const count of [1, 2, 5]) {
        const heaps = BinomialHeap.arena(16, 'min', count);
        assert.equal(heaps.length, count);
        for (let i = 1; i < count; i++) {
            assert.equal(heaps[i]._pool, heaps[0]._pool, 'sibling ' + i + ' must share the pool');
            assert.equal(heaps[i]._key, heaps[0]._key, 'sibling ' + i + ' must share the columns');
        }
    }
});

// --- boundary: -0 as a key and as an id behaves exactly like +0 ------------

test('boundary: -0 key and -0 id are legal and behave identically to +0', () => {
    const h = new BinomialHeap(8, 'min');
    h.push(0, -0); // id -0 collapses to the same slot semantics as id 0
    assert.equal(h.peekMin(), 0);
    assert.equal(Object.is(h.peekMinKey(), -0) || h.peekMinKey() === 0, true);
    const h2 = new BinomialHeap(8, 'min');
    h2.push(1, 5);
    h2.push(2, -0);
    assert.equal(h2.peekMinKey(), -0 < 5 ? -0 : 0); // -0 == 0 numerically; either read is min
    assert.equal(h2.peekMin(), 2);
});

// --- adversarial: re-entrant mutation from inside a forEach callback -------
// BinomialHeap documents NO version-stamped iteration contract (unlike SkipList /
// Treap / Scapegoat / SplayTree's rangeIter). This probes what actually happens:
// it must not corrupt the POOL (conservation) or hang/crash, even though the
// walk order during the mutation is explicitly unspecified.

test('adversarial: re-entrant popMin from inside forEach does not corrupt pool conservation or hang', () => {
    const h = new BinomialHeap(64, 'min');
    for (let i = 0; i < 20; i++) h.push(i, i);
    let calls = 0;
    let poppedInside;
    assert.doesNotThrow(() => {
        h.forEach(() => {
            calls++;
            if (calls === 1) poppedInside = h.popMin(); // re-entrant structural mutation mid-walk
            if (calls > 1000) throw new Error('adversarial forEach did not terminate');
        });
    });
    assert.equal(typeof poppedInside, 'number');
    assert.equal(h._pool.activeSlots + h._pool.freeListLength, h._pool.capacity,
        'a re-entrant popMin mid-forEach must not corrupt the shared pool conservation invariant');
});

// --- adversarial: re-entrant push from inside forEach ----------------------

test('adversarial: re-entrant push from inside forEach does not corrupt pool conservation or hang', () => {
    const h = new BinomialHeap(64, 'min');
    for (let i = 0; i < 10; i++) h.push(i, i);
    let calls = 0;
    assert.doesNotThrow(() => {
        h.forEach(() => {
            calls++;
            if (calls === 1) h.push(999, -1); // re-entrant structural mutation mid-walk
            if (calls > 1000) throw new Error('adversarial forEach did not terminate');
        });
    });
    assert.equal(h._pool.activeSlots + h._pool.freeListLength, h._pool.capacity,
        'a re-entrant push mid-forEach must not corrupt the shared pool conservation invariant');
});
