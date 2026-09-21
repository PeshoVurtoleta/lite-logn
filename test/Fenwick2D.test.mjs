/**
 * @zakkster/lite-logn -- Fenwick2D behavioral suite (node:test).
 *
 * The 2D Binary Indexed Tree: BOTH point-update AND 2D-prefix / rectangle-sum in O(log^2 n) over a
 * single flat `Float64Array((rows+1)*(cols+1))` via the NESTED lowest-set-bit walk (`i & -i` on
 * BOTH dims). This suite proves the point-update + prefix contract, rectSum's 2D inclusion-exclusion
 * (INCLUDING the edges that touch row 0 / col 0 and the full-grid sum), at / set (absolute set via
 * value-at), the two-pass linear `build` equivalence (that it does NOT double-count), the fail-closed
 * coordinate + coercion doors, clear + row-major forEach, and a DIFFERENTIAL FUZZ vs a naive 2D
 * prefix oracle. SUM-ONLY: min / max / gcd are deliberately absent (a future 2D SegmentTree).
 */

import test from 'node:test';
import assert from 'node:assert/strict';
import { Fenwick2D } from '../LogN.js';

// mulberry32 -- deterministic PRNG so fuzz cases replay identically.
function mulberry32(seed) {
    let s = seed >>> 0;
    return function () {
        s = (s + 0x6D2B79F5) | 0;
        let t = Math.imul(s ^ (s >>> 15), s | 1);
        t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
        return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
}

// A naive dense grid oracle: O(rows*cols) per query, but obviously correct.
function makeOracle(rows, cols) {
    const g = [];
    for (let r = 0; r < rows; r++) g.push(new Float64Array(cols));
    return {
        update(r, c, d) { g[r][c] += d; },
        set(r, c, v) { g[r][c] = v; },
        at(r, c) { return g[r][c]; },
        prefix(r, c) {
            let s = 0;
            for (let i = 0; i <= r; i++) for (let j = 0; j <= c; j++) s += g[i][j];
            return s;
        },
        rectSum(r1, c1, r2, c2) {
            let s = 0;
            for (let i = r1; i <= r2; i++) for (let j = c1; j <= c2; j++) s += g[i][j];
            return s;
        },
        clear() { for (let r = 0; r < rows; r++) g[r].fill(0); },
    };
}

// --- construction + fail-closed dims ---------------------------------------

test('constructor validates dims, freezes rows/cols, exposes getters', () => {
    for (const bad of [0, -1, 1.5, NaN, Infinity, '8', null, undefined, Symbol('x'), 3n]) {
        assert.throws(() => new Fenwick2D(bad, 4), /\[lite-logn\]/);
        assert.throws(() => new Fenwick2D(4, bad), /\[lite-logn\]/);
    }
    const f = new Fenwick2D(3, 5);
    assert.equal(f.rows, 3);
    assert.equal(f.cols, 5);
});

test('fresh tree reads zero everywhere; prefix/rectSum/at of an empty grid are 0', () => {
    const f = new Fenwick2D(4, 6);
    assert.equal(f.prefix(3, 5), 0);
    assert.equal(f.rectSum(0, 0, 3, 5), 0);
    for (let r = 0; r < 4; r++) for (let c = 0; c < 6; c++) assert.equal(f.at(r, c), 0);
});

// --- update + prefix correctness -------------------------------------------

test('update + prefix: a single cell shows in every prefix that covers it', () => {
    const f = new Fenwick2D(5, 5);
    assert.equal(f.update(2, 3, 7), f, 'update returns this');
    assert.equal(f.at(2, 3), 7);
    // every prefix (r,c) with r>=2 and c>=3 sees the 7; anything less does not
    assert.equal(f.prefix(2, 3), 7);
    assert.equal(f.prefix(4, 4), 7);
    assert.equal(f.prefix(1, 3), 0);
    assert.equal(f.prefix(2, 2), 0);
    assert.equal(f.prefix(-1, 4), 0);
    assert.equal(f.prefix(4, -1), 0);
});

test('update accumulates (repeated + negative deltas)', () => {
    const f = new Fenwick2D(4, 4);
    f.update(1, 1, 5);
    f.update(1, 1, -2);
    f.update(1, 1, 3);
    assert.equal(f.at(1, 1), 6);
    assert.equal(f.prefix(3, 3), 6);
});

// --- rectSum inclusion-exclusion (incl. edges touching row 0 / col 0) -------

test('rectSum: 2D inclusion-exclusion on all four edges, incl. row 0 / col 0 / full grid', () => {
    const rows = 6, cols = 7;
    const f = new Fenwick2D(rows, cols);
    const oracle = makeOracle(rows, cols);
    // load a known pattern
    for (let r = 0; r < rows; r++) {
        for (let c = 0; c < cols; c++) {
            const v = (r + 1) * 10 + c;
            f.update(r, c, v); oracle.update(r, c, v);
        }
    }
    // interior rectangle
    assert.equal(f.rectSum(1, 2, 4, 5), oracle.rectSum(1, 2, 4, 5));
    // edge touching row 0 (r1 == 0): the P(r1-1, .) inclusion-exclusion terms must vanish cleanly
    assert.equal(f.rectSum(0, 2, 3, 5), oracle.rectSum(0, 2, 3, 5));
    // edge touching col 0 (c1 == 0)
    assert.equal(f.rectSum(2, 0, 5, 4), oracle.rectSum(2, 0, 5, 4));
    // corner touching BOTH row 0 and col 0
    assert.equal(f.rectSum(0, 0, 2, 3), oracle.rectSum(0, 0, 2, 3));
    // the full grid
    assert.equal(f.rectSum(0, 0, rows - 1, cols - 1), oracle.rectSum(0, 0, rows - 1, cols - 1));
    assert.equal(f.rectSum(0, 0, rows - 1, cols - 1), f.prefix(rows - 1, cols - 1));
    // a single-cell rectangle equals at()
    assert.equal(f.rectSum(3, 4, 3, 4), f.at(3, 4));
});

// --- at / set (absolute set via value-at) ----------------------------------

test('set: absolute value assignment, over an existing value, negatives, and re-read', () => {
    const f = new Fenwick2D(5, 5);
    assert.equal(f.set(2, 2, 9), f, 'set returns this');
    assert.equal(f.at(2, 2), 9);
    f.set(2, 2, -4);              // overwrite absolute (not add)
    assert.equal(f.at(2, 2), -4);
    f.update(2, 2, 10);          // update after set adds
    assert.equal(f.at(2, 2), 6);
    // set does not disturb neighbors
    assert.equal(f.at(2, 1), 0);
    assert.equal(f.at(1, 2), 0);
    assert.equal(f.prefix(4, 4), 6);
});

// --- build() equivalence (proves the two-pass build does NOT double-count) --

test('build equals the same cells inserted by repeated update (no double-count)', () => {
    const rows = 9, cols = 11;
    const rnd = mulberry32(0xF2D0);
    const matrix = [];
    for (let r = 0; r < rows; r++) {
        const row = new Float64Array(cols);
        for (let c = 0; c < cols; c++) row[c] = ((rnd() * 200) | 0) - 100;
        matrix.push(row);
    }
    const built = Fenwick2D.build(matrix);
    const inc = new Fenwick2D(rows, cols);
    for (let r = 0; r < rows; r++) for (let c = 0; c < cols; c++) inc.update(r, c, matrix[r][c]);
    // every prefix and every cell must agree -- if build double-counted, some prefix diverges
    for (let r = 0; r < rows; r++) {
        for (let c = 0; c < cols; c++) {
            assert.equal(built.at(r, c), matrix[r][c], 'built cell ' + r + ',' + c);
            assert.equal(built.prefix(r, c), inc.prefix(r, c), 'built prefix ' + r + ',' + c);
        }
    }
    assert.equal(built.rectSum(0, 0, rows - 1, cols - 1), inc.rectSum(0, 0, rows - 1, cols - 1));
    assert.equal(built.rows, rows);
    assert.equal(built.cols, cols);
});

// --- fail-closed doors: OOB coords + non-finite delta/value (typeof FIRST) --

test('out-of-range coords fail closed on every coord-taking op', () => {
    const f = new Fenwick2D(8, 8);
    for (const bad of [-1, 8, 100, 1.5, NaN, '0', null, undefined, Symbol('i')]) {
        assert.throws(() => f.update(bad, 0, 1), /\[lite-logn\]/, 'update r ' + String(bad));
        assert.throws(() => f.update(0, bad, 1), /\[lite-logn\]/, 'update c ' + String(bad));
        assert.throws(() => f.at(bad, 0), /\[lite-logn\]/, 'at r ' + String(bad));
        assert.throws(() => f.at(0, bad), /\[lite-logn\]/, 'at c ' + String(bad));
        assert.throws(() => f.set(bad, 0, 1), /\[lite-logn\]/, 'set r ' + String(bad));
        assert.throws(() => f.set(0, bad, 1), /\[lite-logn\]/, 'set c ' + String(bad));
        assert.throws(() => f.rectSum(bad, 0, 7, 7), /\[lite-logn\]/, 'rectSum r1 ' + String(bad));
        assert.throws(() => f.rectSum(0, 0, 7, bad), /\[lite-logn\]/, 'rectSum c2 ' + String(bad));
    }
});

test('non-finite delta / value fail closed, typeof-guarded FIRST (no Symbol/BigInt coercion)', () => {
    const f = new Fenwick2D(4, 4);
    for (const bad of [NaN, Infinity, -Infinity, '5', null, undefined, {}, Symbol('k'), 3n]) {
        assert.throws(() => f.update(0, 0, bad), /\[lite-logn\]/, 'update delta ' + String(bad));
        assert.throws(() => f.set(0, 0, bad), /\[lite-logn\]/, 'set value ' + String(bad));
    }
    // the door left the tree untouched
    assert.equal(f.prefix(3, 3), 0);
});

test('prefix admits -1 on either dim (empty-prefix base case) but rejects other sub-zero / OOB', () => {
    const f = new Fenwick2D(6, 6);
    f.update(2, 3, 11);
    assert.equal(f.prefix(-1, 5), 0);
    assert.equal(f.prefix(5, -1), 0);
    assert.equal(f.prefix(-1, -1), 0);
    assert.throws(() => f.prefix(-2, 0), /\[lite-logn\]/);
    assert.throws(() => f.prefix(0, -2), /\[lite-logn\]/);
    assert.throws(() => f.prefix(6, 0), /\[lite-logn\]/);
    assert.throws(() => f.prefix(0, 6), /\[lite-logn\]/);
});

test('rectSum with r1 > r2 or c1 > c2 fails closed', () => {
    const f = new Fenwick2D(8, 8);
    assert.throws(() => f.rectSum(5, 0, 2, 7), /\[lite-logn\]/);
    assert.throws(() => f.rectSum(0, 5, 7, 2), /\[lite-logn\]/);
});

test('build fails closed on non-2D-array-like / ragged rows / non-finite entry', () => {
    assert.throws(() => Fenwick2D.build(null), /\[lite-logn\]/);
    assert.throws(() => Fenwick2D.build([1, 2, 3]), /\[lite-logn\]/);          // rows not array-like
    assert.throws(() => Fenwick2D.build([[1, 2], [3]]), /\[lite-logn\]/);      // ragged rows
    assert.throws(() => Fenwick2D.build([[1, NaN], [3, 4]]), /\[lite-logn\]/); // non-finite entry
});

// --- clear + forEach (row-major) -------------------------------------------

test('clear zeroes every cell, keeps dimensions, is reusable', () => {
    const f = new Fenwick2D(4, 5);
    for (let r = 0; r < 4; r++) for (let c = 0; c < 5; c++) f.update(r, c, r * 5 + c + 1);
    assert.ok(f.prefix(3, 4) > 0);
    assert.equal(f.clear(), f, 'clear returns this');
    assert.equal(f.prefix(3, 4), 0);
    assert.equal(f.rows, 4);
    assert.equal(f.cols, 5);
    // reusable after clear
    f.update(1, 1, 42);
    assert.equal(f.at(1, 1), 42);
});

test('forEach visits every cell as (value, r, c, self) in row-major ascending order', () => {
    const rows = 3, cols = 4;
    const f = new Fenwick2D(rows, cols);
    for (let r = 0; r < rows; r++) for (let c = 0; c < cols; c++) f.update(r, c, r * 10 + c);
    const order = [];
    const vals = [];
    f.forEach((value, r, c, self) => {
        assert.equal(self, f, 'fourth arg is the tree');
        order.push([r, c]);
        vals.push(value);
    });
    // row-major order
    let idx = 0;
    for (let r = 0; r < rows; r++) {
        for (let c = 0; c < cols; c++) {
            assert.deepEqual(order[idx], [r, c], 'row-major position ' + idx);
            assert.equal(vals[idx], r * 10 + c, 'value at ' + r + ',' + c);
            idx++;
        }
    }
    assert.equal(order.length, rows * cols);
});

// --- differential fuzz vs a naive 2D-prefix oracle -------------------------

test('differential fuzz: 1e4 mixed update/set/rectSum/prefix ops match a naive oracle', () => {
    const rows = 17, cols = 23;
    const f = new Fenwick2D(rows, cols);
    const oracle = makeOracle(rows, cols);
    const rnd = mulberry32(0xC0FFEE);
    let ops = 0;
    for (let step = 0; step < 12000; step++) {
        const r = (rnd() * rows) | 0;
        const c = (rnd() * cols) | 0;
        const roll = rnd();
        if (roll < 0.35) {
            const d = ((rnd() * 200) | 0) - 100;
            f.update(r, c, d); oracle.update(r, c, d);
        } else if (roll < 0.5) {
            const v = ((rnd() * 200) | 0) - 100;
            f.set(r, c, v); oracle.set(r, c, v);
        } else if (roll < 0.7) {
            assert.equal(f.at(r, c), oracle.at(r, c), 'at ' + r + ',' + c + ' step ' + step);
            ops++;
        } else if (roll < 0.85) {
            assert.equal(f.prefix(r, c), oracle.prefix(r, c), 'prefix ' + r + ',' + c + ' step ' + step);
            ops++;
        } else {
            const r2 = r + ((rnd() * (rows - r)) | 0);
            const c2 = c + ((rnd() * (cols - c)) | 0);
            assert.equal(f.rectSum(r, c, r2, c2), oracle.rectSum(r, c, r2, c2),
                'rectSum ' + r + ',' + c + ',' + r2 + ',' + c2 + ' step ' + step);
            ops++;
        }
    }
    assert.ok(ops > 3000, 'ran a meaningful number of query ops (' + ops + ')');
    // final full sweep: every cell + the full-grid sum agree
    for (let r = 0; r < rows; r++) for (let c = 0; c < cols; c++) {
        assert.equal(f.at(r, c), oracle.at(r, c), 'final at ' + r + ',' + c);
    }
    assert.equal(f.rectSum(0, 0, rows - 1, cols - 1), oracle.rectSum(0, 0, rows - 1, cols - 1));
});
