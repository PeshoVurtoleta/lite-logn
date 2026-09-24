/**
 * @zakkster/lite-logn -- CartesianTree (v1.2.0) behavioral suite.
 *
 * The family's 18th member and SECOND post-1.0 exotic: a STATIC, IMMUTABLE Cartesian tree answering the
 * range-EXTREME INDEX query (offline RMQ) -- rangeMinIndex (WHERE the min/max is in an index range) and
 * rangeMin (that extreme value), both worst-case O(log n) via a binary-lifting LCA, zero-allocation.
 * rangeMinIndex is proven against a brute-force linear scan (the ground truth) over random / sorted /
 * reverse / all-equal shapes for BOTH kinds, ties resolving to the FIRST occurrence (the scan's rule).
 * The Cartesian-tree SHAPE (in-order == 0..n-1; heap property; exactly one root) gets its own oracle, and
 * every fail-closed door is exercised.
 */

import test from 'node:test';
import assert from 'node:assert/strict';
import { CartesianTree } from '../LogN.js';

// mulberry32 -- a small deterministic PRNG so the fuzz corpus is reproducible.
function mulberry32(seed) {
    let s = seed >>> 0;
    return function () {
        s = (s + 0x6D2B79F5) | 0;
        let t = Math.imul(s ^ (s >>> 15), s | 1);
        t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
        return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
}

// The FIRST-occurrence extreme index over [lo, hi] -- the linear-scan ground truth the tree must match.
function bruteRmq(vals, lo, hi, isMin) {
    let best = lo;
    for (let j = lo + 1; j <= hi; j++) {
        if (isMin ? vals[j] < vals[best] : vals[j] > vals[best]) best = j;
    }
    return best;
}

// --- construction + getters -------------------------------------------------

test('CartesianTree build: length / size / kind / root reflect the source', () => {
    const ct = new CartesianTree([5, 1, 5, 3, 1, 9, 3, 3]);
    assert.equal(ct.length, 8);
    assert.equal(ct.size, 8);
    assert.equal(ct.kind, 'min');
    assert.equal(ct.at(ct.root), 1);         // the root holds the global minimum
    assert.equal(ct.root, 1);                // the FIRST minimum (index 1, not 4)
    // the static factory builds an equivalent structure
    const cb = CartesianTree.build([5, 1, 5, 3, 1, 9, 3, 3]);
    assert.equal(cb.rangeMinIndex(0, 7), 1);
    assert.equal(cb.rangeMin(0, 7), 1);
});

test('CartesianTree build: a max tree reports the MAXIMUM index / value', () => {
    const ct = new CartesianTree([5, 1, 9, 3, 9, 2], 'max');
    assert.equal(ct.kind, 'max');
    assert.equal(ct.root, 2);                // the FIRST maximum (index 2, not 4)
    assert.equal(ct.at(ct.root), 9);
    assert.equal(ct.rangeMinIndex(0, 5), 2); // "rangeMinIndex" on a max tree = the MAX's index
    assert.equal(ct.rangeMin(0, 5), 9);
    assert.equal(ct.rangeMinIndex(3, 5), 4); // max of [3,9,2] is 9 at index 4
});

test('CartesianTree build: copies a SNAPSHOT (mutating the source afterward never changes a result)', () => {
    const src = [4, 2, 7, 1];
    const ct = new CartesianTree(src);
    src[0] = -99; src[3] = 99;
    assert.equal(ct.at(0), 4);
    assert.equal(ct.at(3), 1);
    assert.equal(ct.rangeMinIndex(0, 3), 3); // smallest is still the original 1 at index 3
});

test('CartesianTree build: accepts a typed array and preserves negatives / non-integers / duplicates', () => {
    const ct = new CartesianTree(Float64Array.from([-2.5, -2.5, 0, 3.25, -2.5]));
    assert.equal(ct.rangeMin(0, 4), -2.5);
    assert.equal(ct.rangeMinIndex(0, 4), 0); // first -2.5 is at index 0
    assert.equal(ct.rangeMinIndex(2, 4), 4); // -2.5 in [0,3.25,-2.5] is at index 4
    assert.equal(ct.at(3), 3.25);
});

// --- degenerate shapes ------------------------------------------------------

test('CartesianTree: single element', () => {
    const ct = new CartesianTree([42]);
    assert.equal(ct.length, 1);
    assert.equal(ct.root, 0);
    assert.equal(ct.parent(0), -1);
    assert.equal(ct.left(0), -1);
    assert.equal(ct.right(0), -1);
    assert.equal(ct.depth(0), 0);
    assert.equal(ct.at(0), 42);
    assert.equal(ct.rangeMinIndex(0, 0), 0);
    assert.equal(ct.rangeMin(0, 0), 42);
});

test('CartesianTree: all identical values -> leftmost wins every range (FIRST-occurrence tie rule)', () => {
    const ct = new CartesianTree([7, 7, 7, 7, 7]);
    for (let lo = 0; lo < 5; lo++) {
        for (let hi = lo; hi < 5; hi++) {
            assert.equal(ct.rangeMinIndex(lo, hi), lo, 'all-equal tie at [' + lo + ',' + hi + ']');
            assert.equal(ct.rangeMin(lo, hi), 7);
        }
    }
});

// --- Cartesian-tree SHAPE oracle (in-order == 0..n-1; heap property; one root) ----

test('CartesianTree: shape holds for both kinds over a fuzz corpus (in-order, heap, single root)', () => {
    for (const kind of ['min', 'max']) {
        const isMin = kind === 'min';
        for (let trial = 0; trial < 200; trial++) {
            const r = mulberry32(trial * 7 + 1);
            const n = 1 + ((r() * 90) | 0);
            const dom = 1 + ((r() * 8) | 0);           // small domain -> many ties to stress the tie rule
            const vals = [];
            for (let i = 0; i < n; i++) vals.push(((r() * dom) | 0) * 3 - 7);
            const ct = new CartesianTree(vals, kind);

            // exactly one root (the sole node with parent -1), and it IS ct.root
            let roots = 0, theRoot = -1;
            for (let i = 0; i < n; i++) if (ct.parent(i) === -1) { roots++; theRoot = i; }
            assert.equal(roots, 1, 'exactly one root, trial ' + trial);
            assert.equal(theRoot, ct.root, 'the parentless node is ct.root');

            // in-order traversal == 0..n-1 (a BST on index): iterative to avoid deep recursion
            const io = [];
            const stack = [];
            let node = ct.root;
            while (node !== -1 || stack.length > 0) {
                while (node !== -1) { stack.push(node); node = ct.left(node); }
                node = stack.pop();
                io.push(node);
                node = ct.right(node);
            }
            assert.equal(io.length, n, 'in-order visits every node once, trial ' + trial);
            for (let i = 0; i < n; i++) assert.equal(io[i], i, 'in-order[' + i + '] must be ' + i);

            // heap property: for every non-root node, parent is not-worse than child (min: <=, max: >=)
            for (let i = 0; i < n; i++) {
                const p = ct.parent(i);
                if (p !== -1) {
                    if (isMin) assert.ok(vals[p] <= vals[i], 'min-heap parent <= child, trial ' + trial);
                    else assert.ok(vals[p] >= vals[i], 'max-heap parent >= child, trial ' + trial);
                }
            }
        }
    }
});

// --- rangeMinIndex vs brute-force over 10k random (lo,hi), both kinds, 4 shapes ----

test('CartesianTree rangeMinIndex == brute-force argmin/argmax (n=1024, 4 shapes, both kinds, FIRST tie)', () => {
    const n = 1024;
    const shapes = {
        random: (r) => { const v = new Float64Array(n); for (let i = 0; i < n; i++) v[i] = (r() * 500) | 0; return v; },
        sorted: () => { const v = new Float64Array(n); for (let i = 0; i < n; i++) v[i] = i; return v; },
        reverse: () => { const v = new Float64Array(n); for (let i = 0; i < n; i++) v[i] = n - i; return v; },
        allEqual: () => { const v = new Float64Array(n); v.fill(42); return v; },
    };
    for (const kind of ['min', 'max']) {
        const isMin = kind === 'min';
        for (const [name, make] of Object.entries(shapes)) {
            const r = mulberry32(0xC0FFEE ^ (isMin ? 1 : 2));
            const vals = make(r);
            const ct = new CartesianTree(vals, kind);
            for (let t = 0; t < 10000; t++) {
                let lo = (r() * n) | 0, hi = (r() * n) | 0;
                if (lo > hi) { const x = lo; lo = hi; hi = x; }
                const got = ct.rangeMinIndex(lo, hi);
                const want = bruteRmq(vals, lo, hi, isMin);
                assert.equal(got, want, kind + '/' + name + ' rmq [' + lo + ',' + hi + ']');
                assert.equal(ct.rangeMin(lo, hi), vals[want], kind + '/' + name + ' rangeMin');
            }
        }
    }
});

// --- fail-closed doors (every method, typeof-first) -------------------------

test('CartesianTree build: fails closed on non-array-like / bad length / bad kind / non-finite entries', () => {
    for (const bad of [null, undefined, 5, {}, Symbol('x'), true]) {
        assert.throws(() => new CartesianTree(bad), /\[lite-logn\]/, 'ctor ' + String(bad));
    }
    assert.throws(() => new CartesianTree([]), /\[lite-logn\]/, 'empty array');
    for (const bad of ['MIN', 'Max', '', 0, 1, null, {}, Symbol('k'), 3n, true]) {
        assert.throws(() => new CartesianTree([1, 2, 3], bad), /\[lite-logn\]/, 'kind ' + String(bad));
    }
    for (const bad of [NaN, Infinity, -Infinity, '5', null, undefined, {}, Symbol('v'), 3n]) {
        assert.throws(() => new CartesianTree([1, 2, bad]), /\[lite-logn\]/, 'value ' + String(bad));
    }
    assert.throws(() => CartesianTree.build(null), /\[lite-logn\]/);
    assert.throws(() => CartesianTree.build([1, NaN]), /\[lite-logn\]/);
});

test('CartesianTree at/parent/left/right/depth: out-of-range / non-integer / non-number index fails closed', () => {
    const ct = new CartesianTree([3, 1, 2]);
    for (const bad of [-1, 3, 100, 1.5, NaN, Infinity, '0', null, undefined, {}, Symbol('i'), 3n]) {
        for (const m of ['at', 'parent', 'left', 'right', 'depth']) {
            assert.throws(() => ct[m](bad), /\[lite-logn\]/, m + ' ' + String(bad));
        }
    }
    assert.equal(ct.at(0), 3);
    assert.equal(ct.at(2), 2);
    // structural getters return -1 (NIL) where there is no such node
    assert.equal(ct.parent(ct.root), -1);
});

test('CartesianTree rangeMinIndex / rangeMin: bad indices / inverted range fail closed', () => {
    const ct = new CartesianTree([3, 1, 2, 1, 5]);
    for (const bad of [-1, 5, 100, 1.5, NaN, Infinity, '0', null, undefined, {}, Symbol('i'), 3n]) {
        assert.throws(() => ct.rangeMinIndex(bad, 4), /\[lite-logn\]/, 'rangeMinIndex lo ' + String(bad));
        assert.throws(() => ct.rangeMinIndex(0, bad), /\[lite-logn\]/, 'rangeMinIndex hi ' + String(bad));
        assert.throws(() => ct.rangeMin(bad, 4), /\[lite-logn\]/, 'rangeMin lo ' + String(bad));
        assert.throws(() => ct.rangeMin(0, bad), /\[lite-logn\]/, 'rangeMin hi ' + String(bad));
    }
    assert.throws(() => ct.rangeMinIndex(3, 1), /\[lite-logn\]/); // lo > hi
    assert.equal(ct.rangeMinIndex(0, 4), 1);   // first minimum (1 at index 1)
    assert.equal(ct.rangeMinIndex(2, 4), 3);   // minimum of [2,1,5] is 1 at index 3
    assert.equal(ct.rangeMin(0, 4), 1);
});

test('CartesianTree: no mutators exist (STATIC / IMMUTABLE contract)', () => {
    const ct = new CartesianTree([1, 2, 3]);
    for (const m of ['set', 'update', 'insert', 'delete', 'push', 'clear']) {
        assert.equal(typeof ct[m], 'undefined', 'CartesianTree must have no ' + m + ' (immutable)');
    }
});
