/**
 * @zakkster/lite-logn -- SortedArray QA boundary suite (node:test).
 *
 * Extends test/SortedArray.test.mjs with the fail-closed doors + white-box gaps a final gate
 * must independently prove: every mutating / query door is typeof-FIRST (Symbol / BigInt
 * coercion-safe, NaN / +-Infinity rejected); select / keyAt / valueAt reject non-integer
 * indices; rangeIter rejects NaN bounds and lo > hi; build fails closed on shape mismatch,
 * non-finite entries, and DUPLICATE keys; the backing arrays are exactly `capacity` long and
 * are NOT reallocated by set / delete (the copyWithin shift is in place); -0 and a 0 value are
 * both legal (null is not zero).
 */

import test from 'node:test';
import assert from 'node:assert/strict';
import { SortedArray } from '../LogN.js';

// --- constructor doors ------------------------------------------------------

test('constructor fails closed on a bad capacity (typeof-first, Symbol / BigInt safe)', () => {
    for (const bad of [0, -1, 1.5, NaN, Infinity, -Infinity, '8', null, undefined, {}, Symbol('x'), 3n]) {
        assert.throws(() => new SortedArray(bad), /\[lite-logn\]/, 'ctor capacity ' + String(bad));
    }
    // 2^31 is one past the ceiling (2^31 - 1)
    assert.throws(() => new SortedArray(0x80000000), /\[lite-logn\]/, 'capacity above 2^31-1');
    // capacity 1 is the minimum legal
    const sa = new SortedArray(1);
    assert.equal(sa.capacity, 1);
});

// --- key / value doors: typeof-first, fail closed ---------------------------

test('key doors fail closed with a [lite-logn] throw (typeof-first, no coercion)', () => {
    const sa = new SortedArray(8);
    sa.set(1, 1);
    for (const bad of [NaN, Infinity, -Infinity, '5', null, undefined, {}, Symbol('k'), 3n]) {
        assert.throws(() => sa.get(bad), /\[lite-logn\]/, 'get ' + String(bad));
        assert.throws(() => sa.has(bad), /\[lite-logn\]/, 'has ' + String(bad));
        assert.throws(() => sa.set(bad, 1), /\[lite-logn\]/, 'set key ' + String(bad));
        assert.throws(() => sa.delete(bad), /\[lite-logn\]/, 'delete ' + String(bad));
        assert.throws(() => sa.rank(bad), /\[lite-logn\]/, 'rank ' + String(bad));
        assert.throws(() => sa.successor(bad), /\[lite-logn\]/, 'successor ' + String(bad));
        assert.throws(() => sa.predecessor(bad), /\[lite-logn\]/, 'predecessor ' + String(bad));
    }
});

test('value door fails closed (typeof-first); a 0 value and -0 are LEGAL', () => {
    const sa = new SortedArray(8);
    for (const bad of [NaN, Infinity, -Infinity, '5', null, undefined, {}, Symbol('v'), 3n]) {
        assert.throws(() => sa.set(1, bad), /\[lite-logn\]/, 'set value ' + String(bad));
    }
    sa.set(1, 0);
    assert.equal(sa.get(1), 0, 'a 0 value is stored and read back -- null is not zero');
    sa.set(2, -0);
    assert.ok(Object.is(sa.get(2), -0) || sa.get(2) === 0, '-0 is a finite number');
});

// --- select / keyAt / valueAt index doors -----------------------------------

test('select / keyAt / valueAt reject a non-integer index (typeof-first)', () => {
    const sa = new SortedArray(8);
    sa.set(1, 1); sa.set(2, 2);
    for (const bad of [1.5, NaN, Infinity, '0', null, undefined, {}, Symbol('i'), 2n]) {
        assert.throws(() => sa.select(bad), /\[lite-logn\]/, 'select ' + String(bad));
        assert.throws(() => sa.keyAt(bad), /\[lite-logn\]/, 'keyAt ' + String(bad));
        assert.throws(() => sa.valueAt(bad), /\[lite-logn\]/, 'valueAt ' + String(bad));
    }
    // an IN-TYPE out-of-range integer is a soft miss (undefined), not a throw
    assert.equal(sa.select(5), undefined);
    assert.equal(sa.keyAt(-1), undefined);
    assert.equal(sa.valueAt(99), undefined);
});

// --- rangeIter bound doors --------------------------------------------------

test('rangeIter fails closed on NaN bounds and lo > hi; infinities are allowed', () => {
    const sa = new SortedArray(8);
    for (let k = 0; k < 5; k++) sa.set(k, k);
    for (const bad of [NaN, '5', null, undefined, {}, Symbol('b'), 2n]) {
        assert.throws(() => sa.rangeIter(bad, 5), /\[lite-logn\]/, 'lo ' + String(bad));
        assert.throws(() => sa.rangeIter(0, bad), /\[lite-logn\]/, 'hi ' + String(bad));
    }
    assert.throws(() => sa.rangeIter(5, 2), /\[lite-logn\]/, 'lo > hi');
    assert.doesNotThrow(() => [...sa.rangeIter(-Infinity, Infinity)], 'infinite bounds ok');
    assert.doesNotThrow(() => [...sa.rangeIter(3, 3)], 'lo === hi ok');
});

// --- build doors ------------------------------------------------------------

test('build fails closed on shape mismatch / non-array-like / bad count', () => {
    assert.throws(() => SortedArray.build(null, [1]), /\[lite-logn\]/);
    assert.throws(() => SortedArray.build([1], null), /\[lite-logn\]/);
    assert.throws(() => SortedArray.build([1, 2], [1]), /\[lite-logn\]/, 'length mismatch');
    assert.throws(() => SortedArray.build([], []), /\[lite-logn\]/, 'empty count < 1');
});

test('build fails closed on a non-finite key / value (typeof-first) or a duplicate key', () => {
    assert.throws(() => SortedArray.build([1, NaN], [1, 2]), /\[lite-logn\]/, 'non-finite key');
    assert.throws(() => SortedArray.build([1, 2], [1, Infinity]), /\[lite-logn\]/, 'non-finite value');
    assert.throws(() => SortedArray.build([1, Symbol('k')], [1, 2]), /\[lite-logn\]/, 'symbol key');
    assert.throws(() => SortedArray.build([1n, 2n], [1, 2]), /\[lite-logn\]/, 'bigint keys');
    assert.throws(() => SortedArray.build([5, 5], [1, 2]), /\[lite-logn\]/, 'duplicate key (adjacent after sort)');
    assert.throws(() => SortedArray.build([1, 5, 3, 5], [1, 2, 3, 4]), /\[lite-logn\]/, 'duplicate key (non-adjacent input)');
});

// --- WHITE-BOX: backing arrays are exactly capacity + never reallocated ------

test('backing Float64Arrays are exactly `capacity` long', () => {
    const sa = new SortedArray(37);
    assert.equal(sa._key.length, 37);
    assert.equal(sa._value.length, 37);
});

test('set / delete shift IN PLACE: the backing buffers are never reallocated', () => {
    const sa = new SortedArray(64);
    const kBuf = sa._key.buffer, vBuf = sa._value.buffer;
    for (let k = 0; k < 40; k++) sa.set((k * 7) % 64, k);   // scattered inserts (shift-heavy)
    for (let k = 0; k < 20; k++) sa.delete((k * 7) % 64);   // scattered deletes (shift-heavy)
    assert.equal(sa._key.buffer, kBuf, 'key backing store must be the SAME buffer (copyWithin in place)');
    assert.equal(sa._value.buffer, vBuf, 'value backing store must be the SAME buffer');
});

// --- WHITE-BOX: _lb is a true lower bound at both edges ----------------------

test('_lb / rank is correct at the low edge, the high edge, and between duplicates-free keys', () => {
    const sa = new SortedArray(8);
    for (const k of [10, 20, 30]) sa.set(k, k);
    assert.equal(sa.rank(-1e300), 0, 'far below min -> 0');
    assert.equal(sa.rank(10), 0, 'equal to min -> 0 (strictly less)');
    assert.equal(sa.rank(15), 1);
    assert.equal(sa.rank(30), 2, 'equal to max -> size-1');
    assert.equal(sa.rank(1e300), 3, 'far above max -> size');
});

// --- fluent returns ---------------------------------------------------------

test('set / clear return this (fluent)', () => {
    const sa = new SortedArray(4);
    assert.equal(sa.set(1, 1), sa);
    assert.equal(sa.clear(), sa);
});

// --- rangeIter version check timing ------------------------------------------

test('rangeIter checks the version BEFORE every yield, not only at loop exhaustion', () => {
    // A structural mutation that shifts keys AHEAD of the cursor (delete(7) while
    // paused at key 3) must be caught on the very NEXT requested item -- the
    // generator must throw instead of silently yielding the now-shifted keys
    // (8, 9) that a check deferred to exhaustion would let through unnoticed.
    const sa = new SortedArray(16);
    for (let k = 0; k < 10; k++) sa.set(k, k);
    const seen = [];
    assert.throws(() => {
        for (const key of sa.rangeIter(0, 9)) {
            seen.push(key);
            if (key === 3) sa.delete(7); // shifts 8 -> index 7, 9 -> index 8
        }
    }, /\[lite-logn\]/);
    assert.deepEqual(seen, [0, 1, 2, 3], 'must throw before yielding any post-mutation (shifted) key');
});
