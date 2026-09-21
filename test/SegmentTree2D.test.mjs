// SegmentTree2D (v0.13.0) -- behavioral test suite.
//
// The load-bearing test is the 4-KIND DIFFERENTIAL FUZZ: thousands of random
// rectangle queries per fold kind, checked against a naive 2D-fold oracle, AFTER
// interleaved point-updates (not just after build). Querying after updates is what
// catches the inner-then-outer point-update-order bug -- a build-only fuzz would
// hide it because build folds every cell position while a point-update only touches
// one column's path in each row-node.
import test from 'node:test';
import assert from 'node:assert/strict';
import { SegmentTree2D } from '../LogN.js';

function gcd(a, b) { while (b !== 0) { const r = a % b; a = b; b = r; } return a; }

// The naive oracle: fold the rectangle [r1..r2] x [c1..c2] over a plain 2D array.
function oracle(m, r1, c1, r2, c2, kind) {
    let res = kind === 'min' ? Infinity : kind === 'max' ? -Infinity : 0;
    for (let r = r1; r <= r2; r++) {
        for (let c = c1; c <= c2; c++) {
            const v = m[r][c];
            res = kind === 'min' ? Math.min(res, v) : kind === 'max' ? Math.max(res, v) :
                kind === 'sum' ? res + v : gcd(res, v);
        }
    }
    return res;
}

// A small deterministic PRNG so failures reproduce.
function lcg(seed) {
    let s = seed | 0;
    return () => { s = (Math.imul(s, 1664525) + 1013904223) | 0; return (s >>> 0) / 4294967296; };
}

const KINDS = ['min', 'max', 'sum', 'gcd'];

test('constructor: dims, kind, identity-filled fresh tree, _t length = 4*R*C', () => {
    for (const [R, C] of [[1, 1], [1, 7], [7, 1], [3, 5], [8, 8], [13, 6]]) {
        for (const kind of KINDS) {
            const st = new SegmentTree2D(R, C, kind);
            assert.equal(st.rows, R);
            assert.equal(st.cols, C);
            assert.equal(st.kind, kind);
            assert.equal(st._t.length, 4 * R * C, 'backing length must be exactly 4*R*C');
            // fresh tree: every leaf is the fold identity, and a whole-grid query returns it
            const idv = kind === 'min' ? Infinity : kind === 'max' ? -Infinity : 0;
            assert.equal(st.at(0, 0), idv);
            assert.equal(st.query(0, 0, R - 1, C - 1), idv);
        }
    }
});

test('update + query: a hand-checked small grid across all 4 kinds', () => {
    const grid = [[5, 2, 9], [1, 7, 4], [8, 3, 6]];
    for (const kind of KINDS) {
        const st = new SegmentTree2D(3, 3, kind);
        for (let r = 0; r < 3; r++) for (let c = 0; c < 3; c++) st.update(r, c, grid[r][c]);
        assert.equal(st.query(0, 0, 2, 2), oracle(grid, 0, 0, 2, 2, kind), kind + ' full');
        assert.equal(st.query(1, 1, 2, 2), oracle(grid, 1, 1, 2, 2, kind), kind + ' corner');
        assert.equal(st.query(0, 1, 1, 2), oracle(grid, 0, 1, 1, 2, kind), kind + ' band');
        assert.equal(st.query(1, 1, 1, 1), oracle(grid, 1, 1, 1, 1, kind), kind + ' 1x1');
        for (let r = 0; r < 3; r++) for (let c = 0; c < 3; c++) assert.equal(st.at(r, c), grid[r][c]);
    }
});

test('build == repeated update (equivalence) across all 4 kinds and several shapes', () => {
    const rnd = lcg(0xBEEF);
    for (const [R, C] of [[1, 1], [1, 6], [6, 1], [4, 4], [5, 9], [8, 8]]) {
        for (const kind of KINDS) {
            const m = [];
            for (let r = 0; r < R; r++) {
                m.push([]);
                for (let c = 0; c < C; c++) m[r].push(kind === 'gcd' ? (rnd() * 40) | 0 : ((rnd() * 200) | 0) - 80);
            }
            const built = SegmentTree2D.build(m, kind);
            const upd = new SegmentTree2D(R, C, kind);
            for (let r = 0; r < R; r++) for (let c = 0; c < C; c++) upd.update(r, c, m[r][c]);
            // every backing cell must match byte-for-byte (proves internal folds agree, not just queries)
            assert.deepEqual(Array.from(built._t), Array.from(upd._t), kind + ' ' + R + 'x' + C + ' backing mismatch');
        }
    }
});

test('DIFFERENTIAL FUZZ: 4 kinds x thousands of random rects, queried AFTER interleaved updates', () => {
    const rnd = lcg(0x5EED1234);
    let totalQueries = 0;
    for (const kind of KINDS) {
        let kindQueries = 0;
        for (let trial = 0; trial < 60; trial++) {
            const R = 1 + ((rnd() * 12) | 0), C = 1 + ((rnd() * 12) | 0);
            const m = [];
            for (let r = 0; r < R; r++) {
                m.push([]);
                for (let c = 0; c < C; c++) m[r].push(kind === 'gcd' ? (rnd() * 50) | 0 : ((rnd() * 200) | 0) - (kind === 'sum' ? 90 : 0));
            }
            // half the trials start from build(), half from a fresh tree filled by update()
            let st;
            if (trial & 1) {
                st = SegmentTree2D.build(m, kind);
            } else {
                st = new SegmentTree2D(R, C, kind);
                for (let r = 0; r < R; r++) for (let c = 0; c < C; c++) st.update(r, c, m[r][c]);
            }
            // INTERLEAVE point-updates with rectangle queries -- the update-order bite lives here.
            for (let step = 0; step < 25; step++) {
                const ur = (rnd() * R) | 0, uc = (rnd() * C) | 0;
                const v = kind === 'gcd' ? (rnd() * 50) | 0 : ((rnd() * 200) | 0) - (kind === 'sum' ? 90 : 0);
                m[ur][uc] = v;
                st.update(ur, uc, v);
                for (let q = 0; q < 6; q++) {
                    let r1 = (rnd() * R) | 0, r2 = (rnd() * R) | 0, c1 = (rnd() * C) | 0, c2 = (rnd() * C) | 0;
                    if (r1 > r2) { const t = r1; r1 = r2; r2 = t; }
                    if (c1 > c2) { const t = c1; c1 = c2; c2 = t; }
                    const want = oracle(m, r1, c1, r2, c2, kind);
                    const got = st.query(r1, c1, r2, c2);
                    assert.equal(got, want, kind + ' ' + R + 'x' + C + ' rect(' + r1 + ',' + c1 + ',' + r2 + ',' + c2 + ')');
                    kindQueries++;
                }
            }
            // at() must agree with the mutated oracle everywhere
            for (let r = 0; r < R; r++) for (let c = 0; c < C; c++) assert.equal(st.at(r, c), m[r][c]);
        }
        assert.ok(kindQueries >= 5000, kind + ' must run >= 5000 queries, ran ' + kindQueries);
        totalQueries += kindQueries;
    }
    assert.ok(totalQueries >= 20000);
});

test('clear() resets to identity, keeping dims + kind', () => {
    for (const kind of KINDS) {
        const st = new SegmentTree2D(4, 5, kind);
        for (let r = 0; r < 4; r++) for (let c = 0; c < 5; c++) st.update(r, c, ((r * 5 + c) & 7) + 1);
        st.clear();
        const idv = kind === 'min' ? Infinity : kind === 'max' ? -Infinity : 0;
        assert.equal(st.rows, 4);
        assert.equal(st.cols, 5);
        assert.equal(st.kind, kind);
        assert.equal(st.query(0, 0, 3, 4), idv);
        for (let r = 0; r < 4; r++) for (let c = 0; c < 5; c++) assert.equal(st.at(r, c), idv);
    }
});

test('forEach visits every cell as (value, r, c, tree) in row-major ascending order', () => {
    const st = new SegmentTree2D(3, 4, 'sum');
    for (let r = 0; r < 3; r++) for (let c = 0; c < 4; c++) st.update(r, c, r * 10 + c);
    const seen = [];
    st.forEach((value, r, c, tree) => { seen.push([value, r, c]); assert.equal(tree, st); });
    assert.equal(seen.length, 12);
    let k = 0;
    for (let r = 0; r < 3; r++) for (let c = 0; c < 4; c++) {
        assert.deepEqual(seen[k], [r * 10 + c, r, c]);
        k++;
    }
});

test('update returns this (chainable)', () => {
    const st = new SegmentTree2D(2, 2, 'sum');
    assert.equal(st.update(0, 0, 1), st);
    assert.equal(st.clear(), st);
});

test('fail-closed doors: OOB, r1>r2/c1>c2, non-finite (typeof-first), gcd domain', () => {
    const st = new SegmentTree2D(4, 4, 'sum');
    // out-of-range coords
    assert.throws(() => st.update(4, 0, 1), /\[lite-logn\]/);
    assert.throws(() => st.update(0, -1, 1), /\[lite-logn\]/);
    assert.throws(() => st.at(4, 0), /\[lite-logn\]/);
    assert.throws(() => st.query(0, 0, 4, 0), /\[lite-logn\]/);
    // r1 > r2 / c1 > c2
    assert.throws(() => st.query(3, 0, 1, 3), /\[lite-logn\]/);
    assert.throws(() => st.query(0, 3, 3, 1), /\[lite-logn\]/);
    // non-finite value, typeof-first (Symbol/BigInt do NOT coerce)
    for (const bad of [NaN, Infinity, -Infinity, '5', null, undefined, {}, Symbol('k'), 3n]) {
        assert.throws(() => st.update(0, 0, bad), /\[lite-logn\]/, String(bad));
    }
    // gcd kind rejects negatives + non-integers
    const g = new SegmentTree2D(4, 4, 'gcd');
    assert.throws(() => g.update(0, 0, -1), /\[lite-logn\]/);
    assert.throws(() => g.update(0, 0, 1.5), /\[lite-logn\]/);
    g.update(0, 0, 12); // a valid nonnegative integer is fine
    assert.equal(g.at(0, 0), 12);
    // a rejected update is a NO-OP: the tree is unchanged
    const before = Array.from(st._t);
    assert.throws(() => st.update(1, 1, NaN), /\[lite-logn\]/);
    assert.deepEqual(Array.from(st._t), before, 'rejected update must not mutate the tree');
});
