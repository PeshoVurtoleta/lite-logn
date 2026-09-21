/**
 * @zakkster/lite-logn -- PairingHeap QA boundary suite (node:test).
 *
 * Extends test/PairingHeap.test.mjs with the gaps a final gate must independently prove:
 * multi-hop meld chains (union-find alias correctness beyond a single hop), decreaseKey /
 * remove / has / keyOf on a melded-in id surviving SEVERAL melds, an explicit remove-of-
 * the-current-min, popMin-to-empty-then-push root recovery, uneven arena drain (draining
 * one sibling must not perturb another), -0 / +0 key and id edges, a full-arena-no-orphan
 * check, the consumed-donor-is-dead contract on has/keyOf/peekMinKey (untested elsewhere),
 * and an O(1)-meld wall-clock check that is independent of the donor size (the pool-op
 * counter in PairingHeap.test.mjs proves the pool is untouched, but not that CPU work stays
 * bounded -- a regression that replaced the union-find alias with a correct-but-O(|b|)
 * per-node owner retag would still read zero pool ops).
 */

import test from 'node:test';
import assert from 'node:assert/strict';
import { PairingHeap } from '../LogN.js';

function mulberry32(seed) {
    let s = seed >>> 0;
    return function () {
        s = (s + 0x6D2B79F5) | 0;
        let t = Math.imul(s ^ (s >>> 15), s | 1);
        t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
        return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
}

// --- multi-hop meld chain: A <- B <- C <- D (D melded into C, C into B, B into A) ----

test('meld chain (4 hops): every id addressable via the final survivor, drain is fully sorted', () => {
    const [a, b, c, d] = PairingHeap.arena(80, 'min', 4);
    for (let k = 0; k < 20; k++) a.push(k, 1000 - k);        // a: 0..19
    for (let k = 20; k < 40; k++) b.push(k, 1000 - k);       // b: 20..39
    for (let k = 40; k < 60; k++) c.push(k, 1000 - k);       // c: 40..59
    for (let k = 60; k < 80; k++) d.push(k, 1000 - k);       // d: 60..79

    // Chain the melds bottom-up so aliasing must telescope through more than one hop:
    // c absorbs d (c._hid -> unaffected, d._hid -> resolves to c), then b absorbs c
    // (c._hid -> b), then a absorbs b (b._hid -> a). An id originally owned by d must
    // now resolve through d -> c -> b -> a in one _resolve call.
    c.meld(d);
    b.meld(c);
    a.meld(b);

    assert.equal(a.size, 80, 'the survivor holds every node across the whole chain');
    for (const dead of [b, c, d]) {
        assert.equal(dead.size, 0, 'every non-final link is emptied');
        assert.throws(() => dead.push(0, 0), /\[lite-logn\]/, 'every non-final link is dead');
    }

    // an id that started life 3 hops away (d's) is addressable via `a`
    assert.equal(a.has(70), true, 'a d-originated id resolves through the whole chain');
    a.decreaseKey(70, -100);
    assert.equal(a.peekMin(), 70, 'a 3-hop-melded-in id can reach the root');
    assert.equal(a.remove(65), true, 'a 3-hop-melded-in id is removable');
    assert.equal(a.has(65), false);

    // full drain in sorted order: 80 ids pushed, minus the one just removed (65) -> 79 left
    let prev = -Infinity;
    const seen = new Set();
    let n = 0;
    while (a.size > 0) {
        const id = a.popMin();
        const k = id === 70 ? -100 : 1000 - id;
        assert.ok(k >= prev - 1e-9, 'chain-melded drain stays sorted at id ' + id);
        prev = k;
        seen.add(id);
        n++;
    }
    assert.equal(n, 79, '80 pushed minus the one explicit remove(65)');
    assert.equal(seen.size, 79, 'every remaining id across the whole chain surfaces exactly once');
    assert.ok(!seen.has(65), 'the removed id never resurfaces');
});

// --- decreaseKey / remove / has / keyOf on a melded-in id across SEVERAL melds --------

test('an id survives multiple melds and stays addressable + correctly ordered throughout', () => {
    const [a, b, c] = PairingHeap.arena(48, 'min', 3);
    a.push(0, 500);
    b.push(1, 500);
    c.push(2, 500);
    b.meld(c);      // c's id 2 now resolves through b
    assert.equal(b.has(2), true);
    b.decreaseKey(2, 10);
    assert.equal(b.peekMin(), 2);
    a.meld(b);      // b (and transitively c's id 2) now resolves through a
    assert.equal(a.has(2), true, 'id 2 (originally c\'s) is addressable after a 2-hop meld');
    assert.equal(a.keyOf(2), 10);
    a.decreaseKey(2, -5);
    assert.equal(a.peekMin(), 2);
    assert.equal(a.remove(2), true);
    assert.equal(a.has(2), false);
});

// --- explicit remove-of-the-current-min (distinct from popMin, same delegated path) ---

test('remove(peekMin()) behaves exactly like popMin: true, size--, next min correct', () => {
    const h = new PairingHeap(32, 'min');
    const keys = [];
    for (let i = 0; i < 32; i++) { const k = (i * 2654435761) & 0xffff; keys.push(k); h.push(i, k); }
    const sorted = keys.slice().sort((x, y) => x - y);
    for (let step = 0; step < 32; step++) {
        const minId = h.peekMin();
        const minKey = h.peekMinKey();
        assert.equal(minKey, sorted[step], 'remove-of-min step ' + step + ' matches the sorted oracle');
        assert.equal(h.remove(minId), true, 'remove(current min) returns true');
        assert.equal(h.size, 31 - step);
    }
    assert.equal(h.size, 0);
});

// --- popMin-to-empty then push: root recovery from the empty state --------------------

test('drain to empty then push: peekMin/peekMinKey/popMin recover cleanly from _root === 0', () => {
    const h = new PairingHeap(8, 'min');
    for (let i = 0; i < 8; i++) h.push(i, i);
    while (h.size > 0) h.popMin();
    assert.equal(h.peekMin(), undefined);
    assert.equal(h.peekMinKey(), undefined);
    assert.equal(h.popMin(), undefined);
    // push into a heap whose root was just zeroed by the last pop
    h.push(3, -50);
    assert.equal(h.peekMin(), 3);
    assert.equal(h.peekMinKey(), -50);
    h.push(1, -60);
    assert.equal(h.peekMin(), 1, 'a second push after the empty-recovery still links correctly');
    assert.equal(h.popMin(), 1);
    assert.equal(h.popMin(), 3);
    assert.equal(h.popMin(), undefined);
});

// --- uneven arena drain: draining one sibling to empty must not perturb another ------

test('uneven arena drain: fully draining one sibling leaves the others exactly intact', () => {
    const [a, b, c] = PairingHeap.arena(300, 'min', 3);
    for (let i = 0; i < 5; i++) a.push(i, 100 - i);
    for (let i = 100; i < 200; i++) b.push(i, 300 - i);
    for (let i = 200; i < 203; i++) c.push(i, i);
    const bKeysBefore = new Map();
    for (let i = 100; i < 200; i++) bKeysBefore.set(i, b.keyOf(i));

    // fully drain the SMALL sibling `a`
    let drainedA = 0;
    while (a.size > 0) { a.popMin(); drainedA++; }
    assert.equal(drainedA, 5);
    assert.equal(a.size, 0);

    // b and c must be byte-for-byte untouched: same size, same keys, same min
    assert.equal(b.size, 100, 'sibling b size untouched by draining a');
    assert.equal(c.size, 3, 'sibling c size untouched by draining a');
    for (const [id, k] of bKeysBefore) assert.equal(b.keyOf(id), k, 'sibling b key ' + id + ' untouched');
    assert.equal(c.keyOf(200), 200);
    assert.equal(c.keyOf(201), 201);
    assert.equal(c.keyOf(202), 202);
    assert.equal(c.peekMin(), 200);

    // a is reusable (ids [0,5) freed) without disturbing b/c
    for (let i = 0; i < 5; i++) a.push(i, i);
    assert.equal(a.size, 5);
    assert.equal(b.size, 100);
    assert.equal(c.size, 3);
});

// --- -0 / +0 key and id edges ----------------------------------------------------------

test('-0 as a key and -0 as an id are legal and behave as ordinary 0 (IEEE-754 equality)', () => {
    const h = new PairingHeap(8, 'min');
    // -0 is a finite number: legal key. Compare with plain === (IEEE-754: -0 === 0 is
    // true), NEVER Object.is / assert.equal (strict) here, since those distinguish -0/+0.
    h.push(1, -0);
    assert.ok(h.keyOf(1) === 0, 'keyOf(1) IEEE-754-equals 0 (stored key was -0)');
    // -0 is Number.isInteger(-0) === true and -0 >= 0 === true: legal id, aliases slot/id 0
    h.push(-0, 5);
    assert.equal(h.has(0), true, '-0 as an id is the same id as 0');
    assert.equal(h.keyOf(0), 5);
    assert.throws(() => h.push(0, 9), /\[lite-logn\]/, '0 and -0 are the SAME id: re-push is a duplicate');
    // decreaseKey to -0 from a positive key: -0 is not > 0, so a min-heap accepts it
    // (IEEE-754 equal, not a move away from the extreme)
    h.push(2, 3);
    assert.doesNotThrow(() => h.decreaseKey(2, -0));
    assert.ok(h.keyOf(2) === 0, 'keyOf(2) IEEE-754-equals 0 after decreaseKey(2, -0)');
});

// --- full-arena-no-orphan: exact capacity fill wastes no slot, drains + refills exactly ---

test('full-arena-no-orphan: capacity N fills exactly N, drains exactly N, refills exactly N', () => {
    const N = 37;
    const h = new PairingHeap(N, 'min');
    for (let i = 0; i < N; i++) h.push(i, (i * 2654435761) & 0xffff);
    assert.equal(h.size, N);
    assert.throws(() => h.push(N, 1), /\[lite-logn\]/, 'the (N+1)-th id is out of range: no orphan slot exists');
    assert.equal(h._pool.activeSlots, N, 'every capacity slot handed out, none wasted');
    assert.equal(h._pool.freeListLength, 0);
    let drained = 0;
    while (h.size > 0) { h.popMin(); drained++; }
    assert.equal(drained, N);
    assert.equal(h._pool.activeSlots, 0);
    assert.equal(h._pool.freeListLength, N, 'every slot returned, none leaked');
    for (let i = 0; i < N; i++) h.push(i, i);
    assert.equal(h.size, N);
    assert.equal(h._pool.activeSlots, N);
});

// --- consumed-donor-is-dead: has / keyOf / peekMinKey (not covered by the sibling suite) ---

test('a consumed donor throws [lite-logn] on has / keyOf / peekMinKey too (full dead-contract matrix)', () => {
    const [a, b] = PairingHeap.arena(16, 'min', 2);
    a.push(0, 1);
    b.push(1, 2);
    a.meld(b);
    assert.throws(() => b.has(1), /\[lite-logn\]/, 'consumed donor has() fails closed');
    assert.throws(() => b.keyOf(1), /\[lite-logn\]/, 'consumed donor keyOf() fails closed');
    assert.throws(() => b.peekMinKey(), /\[lite-logn\]/, 'consumed donor peekMinKey() fails closed');
    // size / capacity / kind are harmless static/scalar reads: documented as staying live
    // (size reads 0, capacity/kind are immutable) -- NOT part of the dead-contract by design.
    assert.equal(b.size, 0);
    assert.equal(b.capacity, 16);
    assert.equal(b.kind, 'min');
});

// --- O(1) meld: wall-clock cost must not scale with the donor size --------------------

test('meld wall-clock cost is independent of donor size (not merely pool-op-free)', () => {
    function medianMeldNs(donorSize, trials) {
        const times = [];
        for (let t = 0; t < trials; t++) {
            const [x, y] = PairingHeap.arena(donorSize + 4, 'min', 2);
            x.push(0, 1);
            for (let k = 1; k <= donorSize; k++) y.push(k, k);
            const t0 = process.hrtime.bigint();
            x.meld(y);
            const t1 = process.hrtime.bigint();
            times.push(Number(t1 - t0));
        }
        times.sort((p, q) => p - q);
        return times[Math.floor(times.length / 2)];
    }
    // warm up the JIT on both shapes before measuring
    medianMeldNs(4, 20);
    medianMeldNs(20000, 5);

    const smallNs = medianMeldNs(4, 101);
    const bigNs = medianMeldNs(200000, 41);
    // A genuine O(1) meld (a root-link + one alias write) costs low-microseconds
    // regardless of |donor|. An O(|donor|) migration of 200000 nodes would cost
    // orders of magnitude more. Generous absolute + ratio bounds to absorb jitter
    // while still condemning any real per-node work.
    assert.ok(bigNs < 20000, 'a 200000-node meld took ' + bigNs + ' ns; expected < 20000 ns for O(1)');
    assert.ok(bigNs / Math.max(smallNs, 1) < 50,
        'meld cost scaled ' + (bigNs / Math.max(smallNs, 1)).toFixed(1) + 'x from a 4-node to a 200000-node donor');
});

// --- adversarial: interleaved chain-meld + churn + differential fuzz (min AND max) -----

for (const kind of ['min', 'max']) {
    test('adversarial (' + kind + '): >=1e4-op 3-way arena churn -- meld, decreaseKey, remove, re-push, re-meld', () => {
        const n = 4000;
        const STEPS = 12000;
        const [a, b, c] = PairingHeap.arena(n, kind, 3);
        const rnd = mulberry32(0xA11CE ^ (kind === 'min' ? 0 : 1));
        const model = new Map();
        let nextId = 0;
        const heaps = [a, b, c];
        const owner = new Map(); // id -> which heap object currently owns it (post-alias)
        let ops = 0;
        const canPush = () => nextId < n - 3 && heaps.some((h) => !h._consumed);
        const canMeld = () => heaps.filter((h) => !h._consumed).length > 1;
        const doPush = () => {
            const id = nextId++;
            const k = rnd() * 1000;
            const live = heaps.filter((h) => !h._consumed);
            const h = live[(rnd() * live.length) | 0];
            h.push(id, k);
            model.set(id, k);
            owner.set(id, h);
            ops++;
        };
        const doMeld = () => {
            const live = heaps.filter((h) => !h._consumed);
            const dst = live[0], src = live[1];
            dst.meld(src);
            for (const [id, h] of owner) if (h === src) owner.set(id, dst);
            ops++;
        };
        const doDecreaseKey = () => {
            const ids = [...model.keys()];
            const id = ids[(rnd() * ids.length) | 0];
            const cur = model.get(id);
            const nk = kind === 'min' ? cur - 1 - rnd() * 5 : cur + 1 + rnd() * 5;
            owner.get(id).decreaseKey(id, nk);
            model.set(id, nk);
            ops++;
        };
        const doRemove = () => {
            const ids = [...model.keys()];
            const id = ids[(rnd() * ids.length) | 0];
            assert.equal(owner.get(id).remove(id), true);
            model.delete(id);
            owner.delete(id);
            ops++;
        };
        // Unconditional step budget (decoupled from id exhaustion / meld exhaustion): every
        // step FALLS BACK to whichever op is actually legal in the current state, so the
        // full STEPS budget is genuine interleaved churn, never a silently-skipped no-op.
        for (let step = 0; step < STEPS; step++) {
            const r = rnd();
            if ((r < 0.5 || model.size === 0) && canPush()) doPush();
            else if (r < 0.65 && canMeld()) doMeld();
            else if (r < 0.8 && model.size > 0) doDecreaseKey();
            else if (model.size > 0) doRemove();
            else if (canPush()) doPush();
            else if (canMeld()) doMeld();
            // else: no legal op this step (model empty, ids exhausted, one heap left) -- rare tail
        }
        assert.ok(ops >= 10000, 'A5 requires >= 1e4 genuine ops; got ' + ops);
        // drain every still-live heap: each heap's OWN drain must be individually sorted
        // (its internal heap-order contract), and the union must match the model exactly.
        const drained = [];
        for (const h of heaps) {
            if (h._consumed) continue;
            let prev = kind === 'min' ? -Infinity : Infinity;
            while (h.size > 0) {
                const k = model.get(h.popMin());
                const ok = kind === 'min' ? k >= prev - 1e-9 : k <= prev + 1e-9;
                assert.ok(ok, 'per-heap drain order violated (' + kind + ') prev=' + prev + ' k=' + k);
                prev = k;
                drained.push(k);
            }
        }
        assert.equal(drained.length, model.size, 'every live model id is drained exactly once');
        const expectedMultiset = [...model.values()].sort((x, y) => x - y);
        const drainedSorted = drained.slice().sort((x, y) => x - y);
        assert.deepEqual(drainedSorted, expectedMultiset, 'drained multiset matches the model');
    });
}
