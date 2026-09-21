/**
 * @zakkster/lite-logn -- FibonacciHeap QA boundary suite (node:test).
 *
 * Extends test/FibonacciHeap.test.mjs with the gaps a final gate must independently prove:
 * multi-hop meld chains (union-find alias correctness beyond a single hop), decreaseKey / remove /
 * has / keyOf on a melded-in id surviving SEVERAL melds, an explicit remove-of-the-current-min,
 * popMin-to-empty-then-push extreme recovery, uneven arena drain, -0 / +0 key + id edges, a
 * full-arena-no-orphan check, the consumed-donor-is-dead contract on has/keyOf/peekMinKey, and an
 * O(1)-meld wall-clock check independent of the donor size. PLUS the FibonacciHeap-specific
 * WHITE-BOX invariants the RISK log flags: the degree-bucket is sized to the golden-ratio degree
 * bound (a too-small bucket silently corrupts the forest), the bucket is cleared to all-zero AFTER
 * every popMin (no stale entry survives), roots are always unmarked, and a cascading cut actually
 * cuts a marked ancestor chain to the root list.
 */

import test from 'node:test';
import assert from 'node:assert/strict';
import { FibonacciHeap } from '../LogN.js';

function mulberry32(seed) {
    let s = seed >>> 0;
    return function () {
        s = (s + 0x6D2B79F5) | 0;
        let t = Math.imul(s ^ (s >>> 15), s | 1);
        t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
        return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
}

// White-box helpers over the private columns (boundary suite only).
function maxLiveDegree(h) {
    let m = 0;
    for (let s = 1; s <= h._cap; s++) if (h._owner[s] !== 0 && h._degree[s] > m) m = h._degree[s];
    return m;
}
function bucketAllZero(h) {
    for (let i = 0; i < h._bucket.length; i++) if (h._bucket[i] !== 0) return false;
    return true;
}
function everyRootUnmarked(h) {
    if (h._min === 0) return true;
    let x = h._min;
    do { if (h._mark[x] !== 0) return false; x = h._right[x]; } while (x !== h._min);
    return true;
}

// --- WHITE-BOX: the degree bucket is sized to the golden-ratio bound (the flagged RISK) ----

test('degree-bucket is sized to the golden-ratio bound (D(n) <= log_phi n), never undersized', () => {
    // The Fibonacci max degree is floor(log_phi n) ~ 1.4404 * log2 n -- LARGER than log2 n. A bucket
    // sized ceil(log2 cap) would be ~44% short and a consolidation would write past its end. Assert
    // the shipped bucket length covers the golden-ratio bound plus slack for every plausible cap.
    //
    // QA note: this is an EXACT-formula check (>= need + 2), not merely >= need + 1. A random
    // degree-maximizing churn (see the next test) never actually drives the observed max degree
    // anywhere near the theoretical golden-ratio ceiling, so it cannot detect a 1-unit shrink of the
    // documented "+2" slack (measured: shrinking to +1 leaves the WHOLE suite green, including the
    // large-N churn test below). Only this static formula assertion catches that regression, so it
    // must pin the exact documented margin, not a looser lower bound one unit short of it.
    const PHI_LOG2 = Math.log2((1 + Math.sqrt(5)) / 2);
    for (const cap of [1, 2, 7, 64, 1024, 65536, 1 << 20, 0x7fffffff]) {
        const h = new FibonacciHeap(cap, 'min');
        const need = Math.ceil(Math.log2(cap + 1) / PHI_LOG2); // the theorem's degree bound
        assert.ok(h._bucket.length >= need + 2,
            'cap ' + cap + ' bucket len ' + h._bucket.length + ' < the documented golden-ratio bound ' +
            need + ' + 2 (ceil slack + one-past terminal slot)');
    }
});

test('WHITE-BOX: under a degree-maximizing churn, max live degree stays strictly inside the bucket', () => {
    // Drive many rounds of full-fill + decreaseKey + partial-drain (the shape that grows degrees the
    // most) and continuously assert the observed max degree never reaches the bucket length -- direct
    // proof that consolidation cannot write out of bounds. A too-small bucket would either trip this
    // or corrupt the drain (also checked).
    const N = 20000;
    const h = new FibonacciHeap(N, 'min');
    const rnd = mulberry32(0xDEC0DE);
    let maxSeen = 0;
    for (let round = 0; round < 12; round++) {
        for (let i = 0; i < N; i++) if (!h.has(i)) h.push(i, rnd() * 1e9);
        for (let j = 0; j < N / 2; j++) { const id = (rnd() * N) | 0; if (h.has(id)) { const k = h.keyOf(id); if (k > 0) h.decreaseKey(id, k * rnd()); } }
        for (let j = 0; j < N / 2; j++) if (h.size > 0) h.popMin();
        const d = maxLiveDegree(h);
        if (d > maxSeen) maxSeen = d;
        assert.ok(d < h._bucket.length, 'max degree ' + d + ' reached the bucket length ' + h._bucket.length);
    }
    assert.ok(maxSeen > 0, 'the workload must actually build multi-child trees (non-vacuous)');
});

// --- WHITE-BOX: the bucket is cleared to all-zero after every popMin (no stale entry) ------

test('WHITE-BOX: the degree bucket is all-zero after every popMin (no stale slot survives)', () => {
    const h = new FibonacciHeap(2048, 'min');
    const rnd = mulberry32(0xB0FFED);
    for (let i = 0; i < 2048; i++) h.push(i, rnd());
    let pops = 0;
    while (h.size > 0) {
        h.popMin();
        assert.ok(bucketAllZero(h), 'bucket left stale after popMin #' + pops);
        pops++;
    }
    assert.equal(pops, 2048);
});

// --- WHITE-BOX: roots are always unmarked; a cascading cut moves marked ancestors to root --

test('WHITE-BOX: every root is unmarked throughout a decreaseKey-heavy churn', () => {
    const h = new FibonacciHeap(1024, 'min');
    const rnd = mulberry32(0x7A11);
    for (let i = 0; i < 1024; i++) h.push(i, 1000 + rnd() * 1000);
    for (let i = 0; i < 200; i++) h.popMin(); // consolidate into deep marked-capable trees
    for (let step = 0; step < 4000; step++) {
        const id = (rnd() * 1024) | 0;
        if (h.has(id)) {
            const cur = h.keyOf(id);
            h.decreaseKey(id, cur - 1 - rnd() * 10);
            assert.ok(everyRootUnmarked(h), 'a marked node reached the root list at step ' + step);
        } else if (h.size > 0) {
            h.popMin();
            assert.ok(everyRootUnmarked(h), 'a marked node reached the root list after popMin at step ' + step);
        }
    }
});

test('WHITE-BOX: a cascading cut severs a marked ancestor chain (parent count drops, ids re-root)', () => {
    // Construct a heap, consolidate, then decrease children of the SAME parent so the parent loses
    // two children -- the second loss must CASCADE (the parent was marked by the first). We observe
    // the cascade through the public contract (the parent, once cut, becomes a root and its mark
    // clears) using white-box reads of _parent / _mark.
    const h = new FibonacciHeap(256, 'min');
    for (let i = 0; i < 256; i++) h.push(i, i);
    for (let i = 0; i < 64; i++) h.popMin(); // build depth
    // find a node with a parent that itself has a (grand)parent -> depth >= 2 for a real cascade
    let child = -1, parentSlot = 0;
    for (let s = 1; s <= h._cap; s++) {
        if (h._owner[s] === 0) continue;
        const p = h._parent[s];
        if (p !== 0 && h._parent[p] !== 0) { child = h._id[s]; parentSlot = p; break; }
    }
    assert.ok(child >= 0, 'the consolidated forest must contain a depth->=2 node (non-vacuous)');
    const before = h.size;
    // decrease the child far below the min -> cut it to the root (parent gets marked)
    h.decreaseKey(child, h.peekMinKey() - 100);
    assert.equal(h._parent[h._pos[child]], 0, 'the cut child is now a root');
    assert.equal(h.peekMin(), child, 'the cut child reaches the extreme');
    assert.equal(h.size, before, 'a cut moves a node, never drops it');
    // the whole thing still drains in ascending key order (structural integrity after the cut/cascade)
    let prev = -Infinity, n = 0;
    while (h.size > 0) { const k = h.peekMinKey(); assert.ok(k >= prev - 1e-9, 'post-cascade drain order'); prev = k; h.popMin(); n++; }
    assert.equal(n, before);
});

test('WHITE-BOX: a REAL 2-level cascading cut promotes an already-MARKED non-root ancestor to a ' +
    'root (not just marks it) -- the prior test only proves the first-loss MARK; this proves the ' +
    'second-loss CUT actually propagates', () => {
    // The prior test cuts exactly ONE child of a parent and observes only the CHILD re-root (the
    // parent is merely marked, never exercised further). That leaves the theorem's actual mechanism
    // -- a doubly-marked ancestor gets CUT and re-roots itself, continuing the cascade upward --
    // completely unforced. Build a deterministic forest via push(0..N-1, i) + one popMin (pure
    // links, no cuts yet, so the shape is an exact binomial forest); find a NON-ROOT node with
    // degree >= 2 (so it has two children to lose in turn), cut its first child (mark it), then cut
    // its second child (must CUT the parent itself: _parent -> 0, _mark -> 0). A `_cascade` that
    // only ever marks-and-stops (never cuts a doubly-marked ancestor) still passes every OTHER test
    // in this suite (heap order is untouched by a missing cut -- only the amortized degree bound
    // would eventually suffer) but fails HERE.
    const N = 16;
    const h = new FibonacciHeap(N, 'min');
    for (let i = 0; i < N; i++) h.push(i, i);
    h.popMin(); // removes id 0; consolidates the remaining 15 roots into an exact binomial forest
    let parentSlot = -1, kids = [];
    for (let s = 1; s <= h._cap; s++) {
        if (h._owner[s] === 0 || h._parent[s] === 0) continue; // need NON-ROOT
        if (h._degree[s] >= 2) {
            const c0 = h._child[s];
            let x = c0, ids = [];
            do { ids.push(h._id[x]); x = h._right[x]; } while (x !== c0);
            parentSlot = s; kids = ids; break;
        }
    }
    assert.ok(parentSlot >= 0 && kids.length >= 2,
        'the consolidated forest must contain a non-root degree->=2 node (non-vacuous)');
    const parentId = h._id[parentSlot];
    assert.equal(h._mark[parentSlot], 0, 'freshly-linked parent starts unmarked');
    const floor = h.peekMinKey() - 1000;
    // first loss: cut kids[0] -> the parent is marked, NOT cut (still a non-root)
    h.decreaseKey(kids[0], floor);
    assert.equal(h._parent[h._pos[kids[0]]], 0, 'the first cut child is now a root');
    assert.equal(h._mark[parentSlot], 1, 'the parent is marked after its first child loss');
    assert.notEqual(h._parent[parentSlot], 0, 'the parent is NOT yet cut after only one child loss');
    // second loss: cut kids[1] -> the ALREADY-MARKED parent must itself be CUT (re-rooted, unmarked)
    h.decreaseKey(kids[1], floor - 1);
    assert.equal(h._parent[h._pos[kids[1]]], 0, 'the second cut child is now a root');
    assert.equal(h._parent[parentSlot], 0,
        'the doubly-marked parent id ' + parentId + ' must be CUT to a root on the second child loss ' +
        '(a cascade that only marks-and-stops would leave this non-zero)');
    assert.equal(h._mark[parentSlot], 0, 'a cut ancestor has its mark cleared');
    assert.equal(h.has(parentId), true, 'the cut parent is still a live member of the heap');
    // structural integrity survives: full sorted drain, every id exactly once
    let prev = -Infinity, n = 0;
    const seen = new Set();
    while (h.size > 0) { const k = h.peekMinKey(); const id = h.popMin(); assert.ok(k >= prev - 1e-9, 'post-2-level-cascade drain order'); prev = k; seen.add(id); n++; }
    assert.equal(n, N - 1, 'every surviving id (all but the initial popMin) drains exactly once');
    assert.equal(seen.size, N - 1);
});

// --- multi-hop meld chain: A <- B <- C <- D --------------------------------------------

test('meld chain (4 hops): every id addressable via the final survivor, drain is fully sorted', () => {
    const [a, b, c, d] = FibonacciHeap.arena(80, 'min', 4);
    for (let k = 0; k < 20; k++) a.push(k, 1000 - k);        // a: 0..19
    for (let k = 20; k < 40; k++) b.push(k, 1000 - k);       // b: 20..39
    for (let k = 40; k < 60; k++) c.push(k, 1000 - k);       // c: 40..59
    for (let k = 60; k < 80; k++) d.push(k, 1000 - k);       // d: 60..79

    c.meld(d);
    b.meld(c);
    a.meld(b);

    assert.equal(a.size, 80, 'the survivor holds every node across the whole chain');
    for (const dead of [b, c, d]) {
        assert.equal(dead.size, 0, 'every non-final link is emptied');
        assert.throws(() => dead.push(0, 0), /\[lite-logn\]/, 'every non-final link is dead');
    }

    assert.equal(a.has(70), true, 'a d-originated id resolves through the whole chain');
    a.decreaseKey(70, -100);
    assert.equal(a.peekMin(), 70, 'a 3-hop-melded-in id can reach the extreme');
    assert.equal(a.remove(65), true, 'a 3-hop-melded-in id is removable');
    assert.equal(a.has(65), false);

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

test('an id survives multiple melds and stays addressable + correctly ordered throughout', () => {
    const [a, b, c] = FibonacciHeap.arena(48, 'min', 3);
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

// --- explicit remove-of-the-current-min ------------------------------------------------

test('remove(peekMin()) behaves exactly like popMin: true, size--, next min correct', () => {
    const h = new FibonacciHeap(32, 'min');
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

// --- drain-to-empty then push: extreme recovery from the empty state -------------------

test('drain to empty then push: peekMin/peekMinKey/popMin recover cleanly from _min === 0', () => {
    const h = new FibonacciHeap(8, 'min');
    for (let i = 0; i < 8; i++) h.push(i, i);
    while (h.size > 0) h.popMin();
    assert.equal(h.peekMin(), undefined);
    assert.equal(h.peekMinKey(), undefined);
    assert.equal(h.popMin(), undefined);
    h.push(3, -50);
    assert.equal(h.peekMin(), 3);
    assert.equal(h.peekMinKey(), -50);
    h.push(1, -60);
    assert.equal(h.peekMin(), 1, 'a second push after the empty-recovery still links correctly');
    assert.equal(h.popMin(), 1);
    assert.equal(h.popMin(), 3);
    assert.equal(h.popMin(), undefined);
});

// --- uneven arena drain ----------------------------------------------------------------

test('uneven arena drain: fully draining one sibling leaves the others exactly intact', () => {
    const [a, b, c] = FibonacciHeap.arena(300, 'min', 3);
    for (let i = 0; i < 5; i++) a.push(i, 100 - i);
    for (let i = 100; i < 200; i++) b.push(i, 300 - i);
    for (let i = 200; i < 203; i++) c.push(i, i);
    const bKeysBefore = new Map();
    for (let i = 100; i < 200; i++) bKeysBefore.set(i, b.keyOf(i));

    let drainedA = 0;
    while (a.size > 0) { a.popMin(); drainedA++; }
    assert.equal(drainedA, 5);
    assert.equal(a.size, 0);

    assert.equal(b.size, 100, 'sibling b size untouched by draining a');
    assert.equal(c.size, 3, 'sibling c size untouched by draining a');
    for (const [id, k] of bKeysBefore) assert.equal(b.keyOf(id), k, 'sibling b key ' + id + ' untouched');
    assert.equal(c.peekMin(), 200);

    for (let i = 0; i < 5; i++) a.push(i, i);
    assert.equal(a.size, 5);
    assert.equal(b.size, 100);
    assert.equal(c.size, 3);
});

// --- -0 / +0 key and id edges ----------------------------------------------------------

test('-0 as a key and -0 as an id are legal and behave as ordinary 0 (IEEE-754 equality)', () => {
    const h = new FibonacciHeap(8, 'min');
    h.push(1, -0);
    assert.ok(h.keyOf(1) === 0, 'keyOf(1) IEEE-754-equals 0 (stored key was -0)');
    h.push(-0, 5);
    assert.equal(h.has(0), true, '-0 as an id is the same id as 0');
    assert.equal(h.keyOf(0), 5);
    assert.throws(() => h.push(0, 9), /\[lite-logn\]/, '0 and -0 are the SAME id: re-push is a duplicate');
    h.push(2, 3);
    assert.doesNotThrow(() => h.decreaseKey(2, -0));
    assert.ok(h.keyOf(2) === 0, 'keyOf(2) IEEE-754-equals 0 after decreaseKey(2, -0)');
});

// --- full-arena-no-orphan --------------------------------------------------------------

test('full-arena-no-orphan: capacity N fills exactly N, drains exactly N, refills exactly N', () => {
    const N = 37;
    const h = new FibonacciHeap(N, 'min');
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

// --- consumed-donor-is-dead: has / keyOf / peekMinKey -----------------------------------

test('a consumed donor throws [lite-logn] on has / keyOf / peekMinKey too (full dead-contract matrix)', () => {
    const [a, b] = FibonacciHeap.arena(16, 'min', 2);
    a.push(0, 1);
    b.push(1, 2);
    a.meld(b);
    assert.throws(() => b.has(1), /\[lite-logn\]/, 'consumed donor has() fails closed');
    assert.throws(() => b.keyOf(1), /\[lite-logn\]/, 'consumed donor keyOf() fails closed');
    assert.throws(() => b.peekMinKey(), /\[lite-logn\]/, 'consumed donor peekMinKey() fails closed');
    assert.equal(b.size, 0);
    assert.equal(b.capacity, 16);
    assert.equal(b.kind, 'min');
});

// --- O(1) meld: wall-clock cost must not scale with the donor size ----------------------

test('meld wall-clock cost is independent of donor size (not merely pool-op-free)', () => {
    function medianMeldNs(donorSize, trials) {
        const times = [];
        for (let t = 0; t < trials; t++) {
            const [x, y] = FibonacciHeap.arena(donorSize + 4, 'min', 2);
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
    medianMeldNs(4, 20);
    medianMeldNs(20000, 5);

    const smallNs = medianMeldNs(4, 101);
    const bigNs = medianMeldNs(200000, 41);
    assert.ok(bigNs < 20000, 'a 200000-node meld took ' + bigNs + ' ns; expected < 20000 ns for O(1)');
    assert.ok(bigNs / Math.max(smallNs, 1) < 50,
        'meld cost scaled ' + (bigNs / Math.max(smallNs, 1)).toFixed(1) + 'x from a 4-node to a 200000-node donor');
});

// --- adversarial: interleaved chain-meld + churn + differential fuzz (min AND max) -----

for (const kind of ['min', 'max']) {
    test('adversarial (' + kind + '): >=1e4-op 3-way arena churn -- meld, decreaseKey, remove, re-push, re-meld', () => {
        const n = 4000;
        const STEPS = 12000;
        const [a, b, c] = FibonacciHeap.arena(n, kind, 3);
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
        for (let step = 0; step < STEPS; step++) {
            const r = rnd();
            if ((r < 0.5 || model.size === 0) && canPush()) doPush();
            else if (r < 0.65 && canMeld()) doMeld();
            else if (r < 0.8 && model.size > 0) doDecreaseKey();
            else if (model.size > 0) doRemove();
            else if (canPush()) doPush();
            else if (canMeld()) doMeld();
        }
        assert.ok(ops >= 10000, 'A5 requires >= 1e4 genuine ops; got ' + ops);
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

// --- key-checked-BEFORE-id, proven with BOTH args simultaneously invalid ---------------

test('push / decreaseKey check the KEY before the id: with BOTH args invalid, the KEY error wins', () => {
    // The docstrings promise "a non-finite / non-number key (checked FIRST)". Every existing push /
    // decreaseKey fail-closed test supplies exactly ONE bad argument at a time (with the other left
    // valid), so the declared CHECK ORDER is never actually exercised -- a swap of the two guard
    // clauses passes the entire suite unnoticed (confirmed by injection). Supplying a BAD id AND a
    // BAD key in the SAME call is the only way to observe which check runs first.
    const h = new FibonacciHeap(4, 'min');
    assert.throws(() => h.push(-1, Symbol('bad')), /FibonacciHeap key must be a finite number/,
        'push must report the KEY error even though the id (-1) is ALSO invalid');
    assert.throws(() => h.push(-1, NaN), /FibonacciHeap key must be a finite number/);
    h.push(0, 1);
    assert.throws(() => h.decreaseKey(-1, Symbol('bad')), /FibonacciHeap key must be a finite number/,
        'decreaseKey must report the KEY error even though the id (-1) is ALSO invalid');
    assert.throws(() => h.decreaseKey(4, NaN), /FibonacciHeap key must be a finite number/,
        'decreaseKey must report the KEY error even though the id (4, out of range) is ALSO invalid');
});
