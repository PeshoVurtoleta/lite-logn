/**
 * @zakkster/lite-logn -- Fenwick2D QA boundary suite (node:test).
 *
 * Extends test/Fenwick2D.test.mjs with the white-box gaps a final gate must independently prove:
 * the F2D_MAX_CELLS product-overflow door actually BITES (the (rows+1)*(cols+1) guard is a FLOAT
 * multiply, so a large product fails CLOSED rather than wrapping to a small int32 and passing --
 * fail OPEN); the 1xN and Nx1 degenerate grids; the prefix base case at the low edge (r or c = 0);
 * a -0 delta; and a static assertion pinning the backing-array length to exactly (rows+1)*(cols+1).
 */

import test from 'node:test';
import assert from 'node:assert/strict';
import { Fenwick2D } from '../LogN.js';

// --- WHITE-BOX: the F2D_MAX_CELLS product-overflow door bites (no int32 wrap) ----

test('cell-product overflow fails CLOSED; the float multiply does NOT wrap to a small int', () => {
    // rows+1 = cols+1 = 65536 -> (rows+1)*(cols+1) = 2^32 EXACTLY. The float product 4294967296 is
    // > 2^31-1 (2147483647) so the ctor throws. Had the guard used `| 0` the product would wrap to
    // `(2**32) | 0 === 0`, which is NOT > 2^31-1 -> the door would PASS (fail OPEN) and hand back a
    // degenerate zero-cell tree. This adversarial pair is the exact case that separates the two.
    assert.equal((2 ** 32) | 0, 0, 'sanity: an int32-wrapped product would be 0 (a pass = fail open)');
    assert.throws(() => new Fenwick2D(65535, 65535), /\[lite-logn\]/, 'exact-2^32 product must throw');
    // a pair strictly above the ceiling by a hair also throws
    assert.throws(() => new Fenwick2D(46341, 46341), /\[lite-logn\]/); // 46342^2 = 2,147,580,964 > 2^31-1
    // ...and one whose FLOAT product is far past 2^31-1 (would wrap to a mid-size int under | 0)
    assert.throws(() => new Fenwick2D(0x40000000, 4), /\[lite-logn\]/); // (2^30+1)*5 ~ 2^32.3
});

test('a grid just UNDER the ceiling constructs (the door is not over-tight)', () => {
    // (rows+1)*(cols+1) = 2 * 65536 = 131072 <= 2^31-1 -- a thin, tall grid within budget.
    const f = new Fenwick2D(65535, 1);
    assert.equal(f.rows, 65535);
    assert.equal(f.cols, 1);
    assert.equal(f._t.length, 65536 * 2);
});

// --- static: backing-array length is exactly (rows+1)*(cols+1) ---------------

test('backing Float64Array length is exactly (rows+1)*(cols+1) for several shapes', () => {
    for (const [r, c] of [[1, 1], [3, 5], [8, 8], [1, 100], [100, 1], [63, 65]]) {
        const f = new Fenwick2D(r, c);
        assert.ok(f._t instanceof Float64Array, r + 'x' + c + ' backing is a Float64Array');
        assert.equal(f._t.length, (r + 1) * (c + 1), r + 'x' + c + ' backing length');
    }
});

// --- degenerate 1xN and Nx1 grids ------------------------------------------

test('1xN grid behaves as a 1D Fenwick along the single row', () => {
    const cols = 13;
    const f = new Fenwick2D(1, cols);
    let running = 0;
    for (let c = 0; c < cols; c++) { f.update(0, c, c + 1); running += c + 1; }
    assert.equal(f.prefix(0, cols - 1), running);
    assert.equal(f.rectSum(0, 0, 0, cols - 1), running);
    assert.equal(f.rectSum(0, 2, 0, 5), 3 + 4 + 5 + 6); // cols 2..5 hold 3,4,5,6
    assert.equal(f.at(0, 7), 8);
    // the only legal row is 0; row 1 is out of range
    assert.throws(() => f.update(1, 0, 1), /\[lite-logn\]/);
});

test('Nx1 grid behaves as a 1D Fenwick along the single column', () => {
    const rows = 13;
    const f = new Fenwick2D(rows, 1);
    let running = 0;
    for (let r = 0; r < rows; r++) { f.update(r, 0, r + 1); running += r + 1; }
    assert.equal(f.prefix(rows - 1, 0), running);
    assert.equal(f.rectSum(0, 0, rows - 1, 0), running);
    assert.equal(f.rectSum(2, 0, 5, 0), 3 + 4 + 5 + 6);
    assert.equal(f.at(7, 0), 8);
    assert.throws(() => f.update(0, 1, 1), /\[lite-logn\]/);
});

// --- prefix base case at the low edge (r or c = 0) --------------------------

test('prefix at the low edge (r == 0 / c == 0) sums exactly the first row / first column band', () => {
    const rows = 5, cols = 5;
    const f = new Fenwick2D(rows, cols);
    for (let r = 0; r < rows; r++) for (let c = 0; c < cols; c++) f.update(r, c, r * cols + c + 1);
    // prefix(0, c) = sum of row 0 up to col c
    let row0 = 0;
    for (let c = 0; c < cols; c++) { row0 += c + 1; assert.equal(f.prefix(0, c), row0, 'prefix(0,' + c + ')'); }
    // prefix(r, 0) = sum of col 0 down to row r
    let col0 = 0;
    for (let r = 0; r < rows; r++) { col0 += r * cols + 1; assert.equal(f.prefix(r, 0), col0, 'prefix(' + r + ',0)'); }
    // the single corner cell
    assert.equal(f.prefix(0, 0), 1);
    assert.equal(f.rectSum(0, 0, 0, 0), 1);
});

// --- -0 delta ---------------------------------------------------------------

test('-0 delta is a legal finite delta and leaves the cell numerically zero', () => {
    const f = new Fenwick2D(4, 4);
    assert.equal(f.update(1, 1, -0), f);      // finite: does not throw
    assert.equal(f.at(1, 1), 0);
    assert.equal(f.prefix(3, 3), 0);
    // -0 added to a real value is a no-op
    f.update(1, 1, 5);
    f.update(1, 1, -0);
    assert.equal(f.at(1, 1), 5);
});

// --- check-order: delta/value is validated BEFORE the coords (QA pin) -------

test('update/set validate delta/value BEFORE coords: with BOTH invalid, the delta/value error wins', () => {
    const f = new Fenwick2D(4, 4);
    // update(): delta is checked before row, and before col.
    assert.throws(() => f.update(999, 0, NaN), /\[lite-logn\] Fenwick2D delta/, 'update: bad row + bad delta -> delta error wins');
    assert.throws(() => f.update(0, 999, NaN), /\[lite-logn\] Fenwick2D delta/, 'update: bad col + bad delta -> delta error wins');
    assert.throws(() => f.update(-1, -1, Infinity), /\[lite-logn\] Fenwick2D delta/, 'update: bad row+col + bad delta -> delta error wins');
    // set(): value is checked before row, and before col.
    assert.throws(() => f.set(999, 0, NaN), /\[lite-logn\] Fenwick2D value/, 'set: bad row + bad value -> value error wins');
    assert.throws(() => f.set(0, 999, NaN), /\[lite-logn\] Fenwick2D value/, 'set: bad col + bad value -> value error wins');
    // sanity: with a VALID delta/value, the coord error surfaces instead (proves the order, not just presence)
    assert.throws(() => f.update(999, 0, 1), /\[lite-logn\] Fenwick2D row/, 'update: valid delta + bad row -> row error');
    assert.throws(() => f.set(0, 999, 1), /\[lite-logn\] Fenwick2D col/, 'set: valid value + bad col -> col error');
});
