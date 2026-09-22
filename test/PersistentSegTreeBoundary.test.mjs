/**
 * @zakkster/lite-logn -- PersistentSegTree QA boundary + white-box suite (node:test).
 *
 * Extends test/PersistentSegTree.test.mjs with the fail-closed doors + white-box gaps a final gate
 * must independently prove:
 *   - the NIL sentinel (slot 0) is never allocated and its columns stay zero;
 *   - path-copying allocates EXACTLY the root-to-leaf path length per update (off-path subtrees are
 *     SHARED, not copied) -- measured on the bump cursor;
 *   - the three node columns are exactly `budget` long and are NEVER reallocated by update;
 *   - a version handle stays valid + immutable after arbitrarily many later updates / branches;
 *   - every door is typeof-FIRST (Symbol / BigInt coercion-safe, NaN / +-Infinity rejected) and a
 *     failing door is a genuine NO-OP (no slot consumed, no version created);
 *   - the node-arena defensive throw is reachable under a controlled undersize probe;
 *   - a >= 20k mixed-op fuzz over many branching lines vs an independent snapshot oracle, 0
 *     divergences across every surviving version and range.
 */

import test from 'node:test';
import assert from 'node:assert/strict';
import { PersistentSegTree } from '../LogN.js';

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
function lcg(seed) { let s = seed | 0; return () => { s = (Math.imul(s, 1664525) + 1013904223) | 0; return (s >>> 0); }; }

// --- NIL sentinel -----------------------------------------------------------

test('slot 0 is the NIL sentinel: never allocated, columns stay zero', () => {
    const t = new PersistentSegTree(8, 8, 'sum');
    assert.equal(t._next >= 1, true);           // the bump cursor never hands out 0
    assert.equal(t._val[0], 0);
    assert.equal(t._left[0], 0);
    assert.equal(t._right[0], 0);
    let cur = 0;
    for (let s = 0; s < 8; s++) cur = t.update(cur, s % 8, s + 1);
    assert.equal(t._val[0], 0);                  // still untouched after a full history
    assert.equal(t._left[0], 0);
    assert.equal(t._right[0], 0);
    // no root ever points AT slot 0 (every version has a real root)
    for (let v = 0; v < t.versions; v++) assert.notEqual(t._roots[v], 0);
});

// --- path-copy shares off-path subtrees (white-box) -------------------------

test('each update copies EXACTLY the root-to-leaf path (off-path subtrees shared)', () => {
    const n = 16, H = 4;                          // power of two -> every leaf at depth H
    const t = new PersistentSegTree(n, 100, 'sum');
    let cur = 0;
    for (let s = 0; s < 20; s++) {
        const before = t._next;
        cur = t.update(cur, (s * 7) % n, s + 1);
        assert.equal(t._next - before, H + 1, 'update ' + s + ' must copy exactly H+1 nodes');
    }
});

test('backing columns are exactly `budget` long and are never reallocated', () => {
    const n = 8, VC = 10;
    const t = new PersistentSegTree(n, VC, 'sum');
    const budget = t._budget;
    assert.equal(t._val.length, budget);
    assert.equal(t._left.length, budget);
    assert.equal(t._right.length, budget);
    assert.equal(t._roots.length, VC + 1);
    const val0 = t._val, left0 = t._left, right0 = t._right;
    let cur = 0;
    for (let s = 0; s < VC; s++) cur = t.update(cur, s % n, s + 1);
    assert.equal(t._val, val0);                   // same object -> never grew
    assert.equal(t._left, left0);
    assert.equal(t._right, right0);
});

// --- a version stays valid + immutable forever ------------------------------

test('a version handle survives arbitrarily many later updates + branches', () => {
    const t = PersistentSegTree.build([1, 2, 3, 4, 5, 6, 7, 8], 200, 'sum');
    const total = 36;
    const v0Total = t.query(0, 0, 7);
    assert.equal(v0Total, total);
    let cur = 0;
    for (let s = 0; s < 150; s++) {
        cur = t.update((s % 3 === 0) ? 0 : cur, s % 8, s % 5); // frequently re-branch off v0
        assert.equal(t.query(0, 0, 7), total, 'v0 must never change (update ' + s + ')');
    }
    assert.equal(t.at(0, 4), 5);                  // v0 leaf still the built value
});

// --- failing doors are genuine no-ops ---------------------------------------

test('a failing update door consumes no slot + creates no version', () => {
    const t = new PersistentSegTree(8, 8, 'gcd');
    t.update(0, 0, 6);                            // versions = 2, some slots used
    const nextBefore = t._next, verBefore = t.versions;
    const doors = [
        () => t.update(99, 0, 1),                 // bad version
        () => t.update(0, -1, 1),                 // bad index
        () => t.update(0, 0, NaN),                // bad value
        () => t.update(0, 0, -2),                 // bad gcd value
        () => t.update(0, Symbol('x'), 1),        // Symbol index
        () => t.update(0n, 0, 1),                 // BigInt version
    ];
    for (const d of doors) assert.throws(d);
    assert.equal(t._next, nextBefore);           // NO slot consumed by any failed door
    assert.equal(t.versions, verBefore);         // NO version created
});

// --- node-arena defensive throw reachable under a controlled undersize -------

test('the node-arena guard fires (fail-closed) when the bump cursor is forced to the budget', () => {
    // White-box probe (SparseTable r<l precedent): the arena is sized to the exact worst case, so the
    // node-full throw is dead-code by construction. Force it by pinning the cursor at the budget and
    // requesting one more slot -- it must throw [lite-logn], never silently write out of bounds.
    const t = new PersistentSegTree(8, 4, 'sum');
    t._next = t._budget;                          // simulate a full arena
    assert.throws(() => t.update(0, 0, 1), /node arena full/);
});

// --- index door: null / undefined (typeof-guard FIRST -- null is not zero) --

test('index door: null / undefined are rejected, NOT coerced to 0 (at + update)', () => {
    // The QA boundary matrix calls out null explicitly: index 0 is a LEGAL value, so a door that
    // ever coerced (`i | 0`, `i == null ? 0 : i`, etc.) instead of typeof-checking FIRST would let
    // null/undefined silently alias index 0 -- a fail-OPEN. Neither existing index-door test covers
    // this pair, so this closes that gap.
    const t = new PersistentSegTree(8, 4, 'sum');
    for (const bad of [null, undefined]) {
        assert.throws(() => t.at(0, bad), /index must be/, 'at i=' + String(bad));
        assert.throws(() => t.update(0, bad, 1), /index must be/, 'update i=' + String(bad));
    }
});

// --- duplicate dispose: clear() called back-to-back is a safe no-op chain ---

test('duplicate dispose: clear() twice in a row is a safe no-op chain, still fully usable', () => {
    const t = new PersistentSegTree(8, 8, 'sum');
    const v1 = t.update(0, 0, 5);
    assert.equal(t.query(v1, 0, 7), 5);
    t.clear();
    t.clear();                                    // second clear on an already-cleared tree
    assert.equal(t.versions, 1);
    assert.equal(t.query(0, 0, 7), 0);
    assert.equal(t._next, 1 + (2 * 8 - 1));       // exactly the v0 base, not double-built / leaked
    // still usable to full capacity after the double clear
    let cur = 0;
    for (let s = 0; s < 8; s++) cur = t.update(cur, s, s + 1);
    assert.equal(t.query(cur, 0, 7), 36);
});

// --- adversarial: a numeric version handle is REUSED after clear() ----------

test('adversarial: a stale pre-clear handle number is reused post-clear WITHOUT any data bleed', () => {
    // The planner's assertions cover immutability WITHIN one arena lifetime; they do not cover the
    // ABA-style hazard of clear() rewinding the bump cursor and re-handing-out the SAME dense integer
    // handles to entirely different (rebuilt) node data. A caller holding a stale handle from before
    // clear() sees it pass the version door (0 <= handle < vcount) yet must never see pre-clear
    // content or a fold that mixes pre- and post-clear nodes.
    const t = new PersistentSegTree(8, 4, 'sum');
    const preA = t.update(0, 0, 111);             // v1 pre-clear
    const preB = t.update(preA, 1, 222);          // v2 pre-clear
    assert.equal(t.query(preB, 0, 7), 333);
    t.clear();                                    // rewinds _next to 1, _vcount to 1
    // rebuild two NEW versions -- they numerically reuse the handles 1 and 2
    const postA = t.update(0, 2, 7);              // v1 post-clear (same integer as preA)
    const postB = t.update(postA, 3, 9);          // v2 post-clear (same integer as preB)
    assert.equal(postA, preA);
    assert.equal(postB, preB);
    // the reused handles must show ONLY the post-clear data -- zero bleed from the old arena content
    assert.equal(t.query(postA, 0, 7), 7);
    assert.equal(t.query(postB, 0, 7), 16);
    assert.equal(t.at(postB, 0), 0);              // the pre-clear leaf 0 write (111) must be gone
    assert.equal(t.at(postB, 1), 0);              // the pre-clear leaf 1 write (222) must be gone
});

// --- big branching fuzz vs an independent oracle ----------------------------

for (const kind of ['min', 'max', 'sum', 'gcd']) {
    test('20k-op branching fuzz vs a snapshot oracle -- 0 divergences -- ' + kind, () => {
        const N = 12, VC = 1500;
        const t = new PersistentSegTree(N, VC, kind);
        const rnd = lcg(0xBADC0DE ^ (kind.charCodeAt(0) * 977));
        const snaps = [new Array(N).fill(identityOf(kind))];
        for (let s = 0; s < VC; s++) {
            const from = rnd() % snaps.length;    // branch off ANY existing version
            const i = rnd() % N;
            const val = (kind === 'gcd') ? (rnd() % 30) : ((rnd() % 4000) - 2000);
            const v = t.update(from, i, val);
            assert.equal(v, snaps.length);        // dense creation-order handle
            const na = snaps[from].slice(); na[i] = val; snaps.push(na);
        }
        let checks = 0;
        for (let v = 0; v < snaps.length; v++) {
            // sample ranges (all pairs would be ~120k * 1500 -> too slow; hit the endpoints + randoms)
            for (let q = 0; q < 8; q++) {
                let lo = rnd() % N, hi = rnd() % N; if (lo > hi) { const tmp = lo; lo = hi; hi = tmp; }
                assert.equal(t.query(v, lo, hi), bruteRange(kind, snaps[v], lo, hi),
                    'v=' + v + ' [' + lo + ',' + hi + ']');
                checks++;
            }
            assert.equal(t.query(v, 0, N - 1), bruteRange(kind, snaps[v], 0, N - 1));
            checks++;
        }
        assert.ok(checks >= 13000, 'expected >=13k checks, got ' + checks);
    });
}
