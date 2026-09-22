/**
 * @zakkster/lite-logn -- PersistentSegTree behavioral + differential suite.
 *
 * The fifteenth member's contract -- the family's FULLY PERSISTENT (branching) segment tree via
 * path-copying: update(fromVersion, i, value) returns a NEW dense version handle, sharing every
 * off-path subtree with its parent and leaving every prior version byte-identical -- proven at the
 * doors and against an independent brute-force snapshot oracle:
 *   - surface (query / update / at / build / clear; length / versions / versionCapacity / kind);
 *   - all four folds (min / max / sum / gcd) match a per-version brute-force fold over 10k+ random
 *     ops, every version, every range;
 *   - immutability: the PRE-update snapshot of a version is bit-identical after any later update;
 *   - branching: two updates off ONE version yield two independent lines;
 *   - build seeds v0 from an array (== a per-range fold of the array); unwritten cell == identity;
 *   - the node arena fills EXACTLY at 1 + (2n-1) + versionCapacity*(H+1) for a power-of-two n and
 *     the (versionCapacity+1)-th update throws; the version arena fails closed;
 *   - >= 14 fail-closed doors (version / index / range / value / gcd / kind / versionCapacity).
 * Every test BITES: a broken impl (a mutated parent version, a shared-path bug, a wrong fold, a
 * dropped guard, an off-by-one budget) fails it.
 */

import test from 'node:test';
import assert from 'node:assert/strict';
import { PersistentSegTree } from '../LogN.js';

// --- oracle helpers ---------------------------------------------------------

function gcd2(a, b) { while (b !== 0) { const r = a % b; a = b; b = r; } return a; }
function identityOf(kind) { return kind === 'min' ? Infinity : kind === 'max' ? -Infinity : 0; }
function fold(kind, a, b) {
    return kind === 'min' ? (a < b ? a : b) : kind === 'max' ? (a > b ? a : b) :
        kind === 'sum' ? a + b : gcd2(a, b);
}
function bruteRange(kind, arr, lo, hi) {
    let acc = identityOf(kind);
    for (let j = lo; j <= hi; j++) acc = fold(kind, acc, arr[j]);
    return acc;
}
// tiny deterministic LCG (no Math.random, reproducible)
function lcg(seed) { let s = seed | 0; return () => { s = (Math.imul(s, 1664525) + 1013904223) | 0; return (s >>> 0); }; }

// --- surface ----------------------------------------------------------------

test('surface: every documented op + getter exists', () => {
    const t = new PersistentSegTree(8, 4, 'sum');
    for (const m of ['query', 'update', 'at', 'clear']) {
        assert.equal(typeof t[m], 'function', m + ' should be a method');
    }
    assert.equal(typeof PersistentSegTree.build, 'function');
    assert.equal(t.length, 8);
    assert.equal(t.versions, 1);          // only v0 exists
    assert.equal(t.versionCapacity, 4);
    assert.equal(t.kind, 'sum');
});

test('kind getter reflects the frozen fold', () => {
    for (const k of ['min', 'max', 'sum', 'gcd']) {
        assert.equal(new PersistentSegTree(4, 2, k).kind, k);
    }
});

// --- v0 identity ------------------------------------------------------------

test('a fresh tree reads the fold identity everywhere (unwritten cell = identity)', () => {
    for (const k of ['min', 'max', 'sum', 'gcd']) {
        const t = new PersistentSegTree(8, 2, k);
        const id = identityOf(k);
        assert.equal(t.query(0, 0, 7), id);
        assert.equal(t.query(0, 3, 3), id);
        assert.equal(t.at(0, 5), id);
    }
});

// --- update creates a new version, leaves the parent untouched --------------

test('update returns the next dense version and does NOT mutate the parent', () => {
    const t = new PersistentSegTree(8, 8, 'sum');
    const v1 = t.update(0, 3, 5);
    assert.equal(v1, 1);
    assert.equal(t.versions, 2);
    const v2 = t.update(v1, 3, 10);
    assert.equal(v2, 2);
    assert.equal(t.query(0, 0, 7), 0);    // v0 pristine
    assert.equal(t.query(v1, 0, 7), 5);   // v1 has the 5
    assert.equal(t.query(v2, 0, 7), 10);  // v2 overwrote to 10
    assert.equal(t.at(v1, 3), 5);
    assert.equal(t.at(v2, 3), 10);
});

test('branching twice off one version yields two independent lines', () => {
    const t = new PersistentSegTree(8, 8, 'sum');
    const v1 = t.update(0, 3, 5);         // base line
    const a = t.update(v1, 0, 100);       // branch A off v1
    const b = t.update(v1, 7, 200);       // branch B off v1
    assert.equal(t.query(v1, 0, 7), 5);   // parent untouched by either branch
    assert.equal(t.query(a, 0, 7), 105);  // A = 5 + 100
    assert.equal(t.query(b, 0, 7), 205);  // B = 5 + 200
    assert.equal(t.at(a, 7), 0);          // A never touched leaf 7
    assert.equal(t.at(b, 0), 0);          // B never touched leaf 0
});

// --- immutability under a long random history (the load-bearing proof) ------

for (const kind of ['min', 'max', 'sum', 'gcd']) {
    test('the PRE-update snapshot of every version stays bit-identical -- ' + kind, () => {
        const N = 16, VC = 400;
        const t = new PersistentSegTree(N, VC, kind);
        const rnd = lcg(0xC0FFEE ^ (kind.length * 131));
        const snaps = [new Array(N).fill(identityOf(kind))]; // snaps[v] = the array behind version v
        let cur = 0;
        for (let s = 0; s < VC; s++) {
            // branch off a RANDOM existing version half the time (exercise branching)
            const from = (rnd() & 1) ? cur : (rnd() % snaps.length);
            const i = rnd() % N;
            const val = (kind === 'gcd') ? (rnd() % 24) : ((rnd() % 2000) - 1000);
            cur = t.update(from, i, val);
            const na = snaps[from].slice();
            na[i] = val;
            snaps.push(na);
        }
        // EVERY version, EVERY range must still match its own snapshot (no shared-path bleed).
        let checks = 0;
        for (let v = 0; v < snaps.length; v++) {
            for (let lo = 0; lo < N; lo++) {
                for (let hi = lo; hi < N; hi++) {
                    assert.equal(t.query(v, lo, hi), bruteRange(kind, snaps[v], lo, hi),
                        'v=' + v + ' [' + lo + ',' + hi + ']');
                    checks++;
                }
            }
            for (let i = 0; i < N; i++) assert.equal(t.at(v, i), snaps[v][i]);
        }
        assert.ok(checks > 10000, 'expected >10k range checks, got ' + checks);
    });
}

// --- build ------------------------------------------------------------------

test('build seeds v0 from an array (== per-range fold of the array)', () => {
    const vals = [3, 1, 4, 1, 5, 9, 2, 6];
    for (const kind of ['min', 'max', 'sum', 'gcd']) {
        const t = PersistentSegTree.build(vals, 4, kind);
        assert.equal(t.length, vals.length);
        assert.equal(t.versions, 1);
        for (let lo = 0; lo < vals.length; lo++) {
            for (let hi = lo; hi < vals.length; hi++) {
                assert.equal(t.query(0, lo, hi), bruteRange(kind, vals, lo, hi));
            }
        }
    }
});

test('build then update: v0 stays the built snapshot, the new version diverges', () => {
    const t = PersistentSegTree.build([10, 20, 30, 40], 4, 'sum');
    const v1 = t.update(0, 1, 99);
    assert.equal(t.query(0, 0, 3), 100);  // built total
    assert.equal(t.query(v1, 0, 3), 179); // 10 + 99 + 30 + 40
    assert.equal(t.at(0, 1), 20);
    assert.equal(t.at(v1, 1), 99);
});

// --- non-power-of-two length ------------------------------------------------

test('non-power-of-two length: folds + persistence hold', () => {
    const N = 5, VC = 50;
    const t = new PersistentSegTree(N, VC, 'sum');
    const rnd = lcg(0x5EED);
    const snaps = [new Array(N).fill(0)];
    let cur = 0;
    for (let s = 0; s < VC; s++) {
        const i = rnd() % N, val = (rnd() % 100);
        cur = t.update(cur, i, val);
        const na = snaps[snaps.length - 1].slice(); na[i] = val; snaps.push(na);
    }
    for (let v = 0; v < snaps.length; v++) {
        for (let lo = 0; lo < N; lo++) for (let hi = lo; hi < N; hi++) {
            assert.equal(t.query(v, lo, hi), bruteRange('sum', snaps[v], lo, hi));
        }
    }
});

// --- capacity: exact node budget + fail-closed version arena -----------------

test('node arena fills EXACTLY at 1 + (2n-1) + versionCapacity*(H+1) for a power-of-two n', () => {
    const n = 8, VC = 6;      // H = 3 -> each update copies exactly H+1 = 4 nodes
    const t = new PersistentSegTree(n, VC, 'sum');
    const H = 3;
    const base = 1 + (2 * n - 1);
    assert.equal(t._next, base);                     // after the v0 seed
    let cur = 0;
    for (let s = 0; s < VC; s++) cur = t.update(cur, s % n, s + 1);
    assert.equal(t._next, base + VC * (H + 1));       // exactly the budget
    assert.equal(t._next, t._budget);
});

test('the (versionCapacity+1)-th update fails closed as a no-op', () => {
    const n = 8, VC = 3;
    const t = new PersistentSegTree(n, VC, 'sum');
    let cur = 0;
    for (let s = 0; s < VC; s++) cur = t.update(cur, 0, s + 1);
    assert.equal(t.versions, VC + 1);                 // v0 .. vVC
    const before = t._next, vbefore = t.versions;
    assert.throws(() => t.update(cur, 0, 99), /version arena full/);
    assert.equal(t._next, before);                    // no slot consumed
    assert.equal(t.versions, vbefore);                // no version created
});

test('the node-arena FLOAT-product guard fails closed on overflow (no int wrap)', () => {
    // versionCapacity chosen so versionCapacity*(H+1) alone exceeds 2^31 -- a `| 0` product would
    // wrap to a small/negative int and pass; the float guard must reject.
    assert.throws(() => new PersistentSegTree(1 << 20, 2 ** 28, 'sum'), /node arena too large/);
});

// --- clear ------------------------------------------------------------------

test('clear discards versions + values and re-seeds a fresh identity v0', () => {
    const t = new PersistentSegTree(8, 8, 'sum');
    const v1 = t.update(0, 0, 5);
    assert.equal(t.query(v1, 0, 7), 5);
    t.clear();
    assert.equal(t.versions, 1);
    assert.equal(t.query(0, 0, 7), 0);                // identity again
    assert.throws(() => t.query(v1, 0, 7), /version must be/); // the old handle is gone
    // usable after clear
    const v2 = t.update(0, 3, 7);
    assert.equal(v2, 1);
    assert.equal(t.query(v2, 0, 7), 7);
});

// --- fail-closed doors ------------------------------------------------------

test('version door: typeof-first, out-of-range, non-integer, Symbol / BigInt all throw', () => {
    const t = new PersistentSegTree(8, 4, 'sum');
    t.update(0, 0, 1); // now versions = 2 (0,1)
    for (const bad of [-1, 2, 0.5, NaN, Infinity, '0', null, undefined, {}, Symbol('x'), 0n]) {
        assert.throws(() => t.query(bad, 0, 0), /version must be/, 'query v=' + String(bad));
        assert.throws(() => t.at(bad, 0), /version must be/, 'at v=' + String(bad));
        assert.throws(() => t.update(bad, 0, 1), /version must be/, 'update v=' + String(bad));
    }
});

test('range door: lo > hi, lo = -1, hi = n, non-integer, Symbol / BigInt all throw', () => {
    const t = new PersistentSegTree(8, 4, 'sum');
    for (const [lo, hi] of [[3, 1], [-1, 0], [0, 8], [0.5, 3], [0, 3.5]]) {
        assert.throws(() => t.query(0, lo, hi), /query needs integers/, 'lo=' + lo + ' hi=' + hi);
    }
    assert.throws(() => t.query(0, Symbol('x'), 0), /query needs integers/);
    assert.throws(() => t.query(0, 0n, 0), /query needs integers/);
    assert.throws(() => t.query(0, 0, 3n), /query needs integers/);
});

test('index door (at + update): -1, n, non-integer, Symbol / BigInt all throw', () => {
    const t = new PersistentSegTree(8, 4, 'sum');
    for (const bad of [-1, 8, 0.5, NaN, '3', Symbol('x'), 2n]) {
        assert.throws(() => t.at(0, bad), /index must be/, 'at i=' + String(bad));
        assert.throws(() => t.update(0, bad, 1), /index must be/, 'update i=' + String(bad));
    }
});

test('value door: NaN / Infinity / Symbol / BigInt (typeof-first) throw', () => {
    const t = new PersistentSegTree(8, 4, 'sum');
    for (const bad of [NaN, Infinity, -Infinity, '5', null, undefined, {}, Symbol('x'), 5n]) {
        assert.throws(() => t.update(0, 0, bad), /value must be a finite number/, 'v=' + String(bad));
    }
});

test('gcd value door additionally rejects negatives + non-integers', () => {
    const t = new PersistentSegTree(8, 4, 'gcd');
    for (const bad of [-2, -1, 1.5, 3.0001]) {
        assert.throws(() => t.update(0, 0, bad), /gcd value must be a nonnegative integer/, 'v=' + bad);
    }
    // legal gcd values: 0 and positive integers (0 is identity, null is not zero)
    assert.equal(t.update(0, 0, 0), 1);
    assert.equal(t.update(0, 0, 12), 2);
});

test('constructor doors: bad length / versionCapacity / kind fail closed', () => {
    for (const bad of [0, -1, 1.5, NaN, Infinity, '8', null, undefined, {}, Symbol('x'), 3n]) {
        assert.throws(() => new PersistentSegTree(bad, 4, 'sum'), /length must be/, 'len=' + String(bad));
    }
    for (const bad of [0, -1, 1.5, NaN, '4', null, Symbol('x'), 2n]) {
        assert.throws(() => new PersistentSegTree(8, bad, 'sum'), /versionCapacity must be/, 'vc=' + String(bad));
    }
    for (const bad of ['avg', 'MIN', '', null, undefined, 3, Symbol('x')]) {
        assert.throws(() => new PersistentSegTree(8, 4, bad), /kind must be/, 'kind=' + String(bad));
    }
});

test('build doors: non-array-like / non-finite / gcd-domain fail closed', () => {
    assert.throws(() => PersistentSegTree.build(null, 4, 'sum'), /needs an array-like/);
    assert.throws(() => PersistentSegTree.build(42, 4, 'sum'), /needs an array-like/);
    assert.throws(() => PersistentSegTree.build([], 4, 'sum'), /count must be/);
    assert.throws(() => PersistentSegTree.build([1, NaN, 3], 4, 'sum'), /value must be a finite number/);
    assert.throws(() => PersistentSegTree.build([1, Infinity], 4, 'sum'), /value must be a finite number/);
    assert.throws(() => PersistentSegTree.build([1, -2], 4, 'gcd'), /gcd value must be a nonnegative integer/);
    assert.throws(() => PersistentSegTree.build([1, 1.5], 4, 'gcd'), /gcd value must be a nonnegative integer/);
    // build still validates versionCapacity + kind via the ctor
    assert.throws(() => PersistentSegTree.build([1, 2], 0, 'sum'), /versionCapacity must be/);
    assert.throws(() => PersistentSegTree.build([1, 2], 4, 'bad'), /kind must be/);
});

// --- -0 / 0 legality (null is not zero) -------------------------------------

test('0 and -0 are legal values (null is not zero)', () => {
    const t = new PersistentSegTree(4, 4, 'sum');
    const v1 = t.update(0, 0, 0);
    assert.equal(t.at(v1, 0), 0);
    const v2 = t.update(0, 1, -0);
    assert.ok(t.at(v2, 1) === 0); // -0 === 0 is true; the cell holds a legal zero
});
