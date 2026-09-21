// SegmentTree2D (v0.13.0) -- white-box boundary suite.
//
// Proves the backing-store sizing, the S2D_MAX product-overflow door (the
// float-multiply guard that must NOT be a `| 0` that wraps a large product to a
// small int and fails OPEN), degenerate 1xN / Nx1 grids, identity-fill on a cleared
// tree, and -0 handling.
import test from 'node:test';
import assert from 'node:assert/strict';
import { SegmentTree2D } from '../LogN.js';

test('backing store is exactly 4*rows*cols cells for several (R, C)', () => {
    for (const [R, C] of [[1, 1], [1, 10], [10, 1], [2, 3], [8, 8], [17, 5], [100, 40]]) {
        const st = new SegmentTree2D(R, C, 'sum');
        assert.equal(st._t.length, 4 * R * C, R + 'x' + C);
        // stride is 2*cols; the row-tree has 2*rows rows of that stride
        assert.equal(st._w, 2 * C);
    }
});

test('S2D_MAX product-overflow door: 4*R*C > 2^31-1 fails CLOSED (float multiply, no |0 wrap)', () => {
    // 0x20000000 = 2^29; 4 * 2^29 * 2^29 = 2^60, VASTLY over the 2^31-1 ceiling. A `| 0` product
    // would wrap this to a small (possibly 0 / negative) int and pass the door -> under-allocation
    // -> OOB. The float multiply keeps it exact, so it must THROW.
    assert.throws(() => new SegmentTree2D(0x20000000, 0x20000000, 'sum'), /\[lite-logn\]/);
    // A dim pair that individually is fine but whose product overflows.
    assert.throws(() => new SegmentTree2D(2, 0x40000000, 'min'), /\[lite-logn\]/);
    assert.throws(() => new SegmentTree2D(0x40000000, 2, 'max'), /\[lite-logn\]/);
    // The overflow throw must be a RangeError tagged [lite-logn] and mention the cell count, not a
    // silent wrap: a wrapped `| 0` would have constructed a tiny array instead.
    let threw = false;
    try { new SegmentTree2D(0x20000000, 0x20000000, 'sum'); } catch (e) {
        threw = true;
        assert.ok(e instanceof RangeError);
        assert.match(e.message, /grid too large/);
    }
    assert.ok(threw, 'the overflow door must throw');
    // A grid right at a comfortable size still constructs (the guard is not over-tight).
    const ok = new SegmentTree2D(1000, 500, 'sum'); // 4*1000*500 = 2,000,000 cells
    assert.equal(ok._t.length, 2000000);
});

test('degenerate 1xN and Nx1 grids behave as 1D segment trees', () => {
    // 1 x N (a single row)
    const row = new SegmentTree2D(1, 6, 'min');
    const vals = [5, 2, 8, 1, 9, 3];
    for (let c = 0; c < 6; c++) row.update(0, c, vals[c]);
    assert.equal(row.query(0, 0, 0, 5), 1);
    assert.equal(row.query(0, 1, 0, 2), 2);
    assert.equal(row.query(0, 4, 0, 4), 9);
    // N x 1 (a single column)
    const col = new SegmentTree2D(6, 1, 'max');
    for (let r = 0; r < 6; r++) col.update(r, 0, vals[r]);
    assert.equal(col.query(0, 0, 5, 0), 9);
    assert.equal(col.query(1, 0, 3, 0), 8);
    // 1 x 1 (a single cell)
    const one = new SegmentTree2D(1, 1, 'sum');
    one.update(0, 0, 42);
    assert.equal(one.query(0, 0, 0, 0), 42);
    assert.equal(one.at(0, 0), 42);
});

test('identity fill on a cleared / fresh tree is a legal RESULT for every kind', () => {
    const cases = [['min', Infinity], ['max', -Infinity], ['sum', 0], ['gcd', 0]];
    for (const [kind, idv] of cases) {
        const st = new SegmentTree2D(5, 5, kind);
        // fresh: whole grid folds to identity
        assert.equal(st.query(0, 0, 4, 4), idv, kind + ' fresh');
        // set one cell, clear, and it is back to identity everywhere
        st.update(2, 2, 7);
        st.clear();
        assert.equal(st.query(0, 0, 4, 4), idv, kind + ' cleared');
        // a query over a region of only-identity cells returns identity (a partially-filled tree)
        const st2 = new SegmentTree2D(4, 4, kind);
        st2.update(0, 0, kind === 'gcd' ? 6 : 6);
        assert.equal(st2.query(1, 1, 3, 3), idv, kind + ' untouched sub-region');
    }
});

test('-0 value: stored and read back, folds like 0', () => {
    const st = new SegmentTree2D(2, 2, 'sum');
    st.update(0, 0, -0);
    // -0 is a finite number, so it passes the door; reads back as 0 (Object.is distinguishes but
    // arithmetic treats them equal). The sum over the grid stays 0.
    assert.equal(st.query(0, 0, 1, 1), 0);
    assert.ok(Object.is(st.at(0, 0), 0) || Object.is(st.at(0, 0), -0));
    // min with a real value: -0 does not corrupt the compare
    const mn = new SegmentTree2D(2, 2, 'min');
    mn.update(0, 0, -0);
    mn.update(0, 1, 5);
    assert.equal(mn.query(0, 0, 0, 1), -0 < 5 ? -0 : 5); // -> 0
});
