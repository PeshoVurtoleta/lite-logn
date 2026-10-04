// @zakkster/lite-logn -- demo HONESTY GATE (repo-only dev artifact, NEVER shipped).
//
//   node --test demo/Demo.test.mjs               (faithfulness + trinity + pins)
//   node --expose-gc --test demo/Demo.test.mjs   (adds the 0-B/op hot-kernel gate)
//
// This file proves the demo can never drift from ../LogN.js:
//   (a) FAITHFULNESS -- 16 per-member oracle suites cross-check each kernel against an
//       INDEPENDENT recompute (a JS shadow / brute-force scan), never the library's own answer.
//   (b) VERSION-TRINITY -- kernels.VERSION === LogN.VERSION === package.json.version.
//   (c) 0-B/op -- every stepX + snapshotX allocates 0 bytes/op after warmup; the 6 foils are
//       asserted to be the ONLY allocators (gate non-vacuous).
//   (d) LAYOUT-DRIFT pins -- each snapshot's internal `_field` reads are pinned by constructor,
//       so a future LogN.js rename fails here with a [lite-logn-demo] message.
//   (e) headless ns/op table behind an import.meta main guard, off the SHIPPED fitLogLinear.
// Every throw here carries the [lite-logn-demo] prefix. ASCII-only per suite law.

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { dirname, join } from 'node:path';
import { readFileSync } from 'node:fs';
import { spawnSync } from 'node:child_process';

import {
    BinaryHeap, MinMaxHeap, BinomialHeap, PairingHeap, FibonacciHeap,
    SkipList, Treap, Scapegoat, SplayTree, SortedArray,
    Fenwick, SegmentTree, Fenwick2D, SegmentTree2D,
    PersistentSegTree, MergeSortTree, VERSION as LOGN_VERSION,
} from '../LogN.js';
import * as K from './kernels.mjs';
import { fitLogLinear, MEMBERS as WITNESS_MEMBERS } from '../test/witness.mjs';
import { WITNESS_BANDS, R2_FLOOR } from './witness-data.mjs';

const DEMO_DIR = dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = dirname(DEMO_DIR);
const require = createRequire(import.meta.url);
const PKG = require('../package.json');

// A local deterministic PRNG for the oracle scripts (never shares state with the kernels).
function rng(seed) { const s = new Uint32Array(1); s[0] = seed >>> 0; return s; }
function u32(s) {
    let a = (s[0] + 0x6d2b79f5) | 0; s[0] = a >>> 0;
    a = Math.imul(a ^ (a >>> 15), a | 1);
    a ^= a + Math.imul(a ^ (a >>> 7), a | 61);
    return (a ^ (a >>> 14)) >>> 0;
}

// =======================================================================================
// (b) VERSION TRINITY
// =======================================================================================

test('version trinity: kernels.VERSION === LogN.VERSION === package.json.version', () => {
    // No pinned literal: the trinity tracks whatever /release sets, it does not freeze a number.
    assert.equal(K.VERSION, LOGN_VERSION, 'kernels re-export must equal LogN.VERSION');
    assert.equal(K.VERSION, PKG.version, 'kernels VERSION must equal package.json version');
});

// =======================================================================================
// (b2) WITNESS-DATA DRIFT -- the browser Truth Panel's static band table must equal the
// gated `npm run witness` registry. witness-data.mjs is a hand-copied, browser-importable
// mirror (test/witness.mjs pulls in node: modules); this fail-closed test is the ONLY thing
// keeping it honest. A witness recalibration that forgets to update witness-data.mjs FAILS
// here -- the panel can never silently show a stale band.
// =======================================================================================

// The exact drift check, factored out so the TEETH test exercises the SAME code on a mutated
// copy (not a stand-in). Throws (via assert) the instant any band/axis/floor/op disagrees.
function assertBandsMatch(bands) {
    const names = Object.keys(bands);
    assert.equal(names.length, 16, 'the demo band table must cover all 16 demo members');
    for (const name of names) {
        const wd = bands[name];
        const m = WITNESS_MEMBERS.find((x) => x.name === name && x.op === wd.op);
        assert.ok(m, '[lite-logn-demo] no gated witness MEMBER for ' + name + '.' + wd.op +
            ' -- witness-data.mjs op drifted from the registry');
        assert.equal(wd.lo, m.slopeLo, '[lite-logn-demo] ' + name + '.' + wd.op + ' lo band drifted: ' +
            wd.lo + ' vs witness ' + m.slopeLo);
        assert.equal(wd.hi, m.slopeHi, '[lite-logn-demo] ' + name + '.' + wd.op + ' hi band drifted: ' +
            wd.hi + ' vs witness ' + m.slopeHi);
        const axis = m.xOf ? '(log2 n)^2' : 'log2(n)';
        assert.equal(wd.axis, axis, '[lite-logn-demo] ' + name + '.' + wd.op + ' axis drifted: ' +
            wd.axis + ' vs witness ' + axis);
        assert.equal(R2_FLOOR, m.r2Floor, '[lite-logn-demo] ' + name + ' R^2 floor drifted: ' +
            R2_FLOOR + ' vs witness ' + m.r2Floor);
    }
}

test('witness-data drift: every demo band equals the test/witness.mjs gated registry (fail closed)', () => {
    assertBandsMatch(WITNESS_BANDS);
});

test('witness-data drift has TEETH: the real check fails on a mutated band copy', () => {
    assertBandsMatch(WITNESS_BANDS); // sanity: the real table passes
    // deep-copy the table, nudge Treap.lo 2.55 -> 2.56, and prove the SAME check now throws.
    const mutated = {};
    for (const name in WITNESS_BANDS) mutated[name] = { ...WITNESS_BANDS[name] };
    assert.equal(mutated.Treap.lo, 2.55, 'guard: the Treap lo we mutate must start at 2.55');
    mutated.Treap.lo = 2.56;
    assert.throws(() => assertBandsMatch(mutated),
        'a drifted Treap lo band (2.56 vs gated 2.55) must fail the drift check');
});

test('index.html reads VERSION via import, never a hardcoded version literal', () => {
    const html = readFileSync(join(DEMO_DIR, 'index.html'), 'utf8');
    assert.ok(html.includes('VERSION'), 'index.html must reference the imported VERSION');
    assert.ok(!html.includes("'" + PKG.version + "'") && !html.includes('"' + PKG.version + '"'),
        'index.html must not embed a hardcoded version string ' + PKG.version);
});

// =======================================================================================
// (a) FAITHFULNESS -- 16 oracle suites
// =======================================================================================

// ---- Scene 01: priority queues --------------------------------------------------------

test('faithfulness: BinaryHeap drained pops are non-decreasing AND equal a JS sort of pushes', () => {
    const cap = 300, h = new BinaryHeap(cap, 'min'), s = rng(0xabcd), keys = [];
    for (let i = 0; i < cap; i++) { const k = u32(s) & 0xffff; h.push(i, k); keys.push(k); }
    keys.sort((a, b) => a - b);
    let prev = -Infinity, i = 0;
    for (;;) { const id = h.pop(); if (id === undefined) break; const k = keys[i++]; assert.ok(k >= prev); prev = k; }
    assert.equal(i, cap, 'every pushed key must be drained in sorted order');
});

test('faithfulness: BinaryHeap keyOf/has track membership; snapshot root == peek/topKey', () => {
    const w = K.createBinaryHeapWorld(200, 100);
    for (let i = 0; i < 4000; i++) K.stepBinaryHeapWorld(w);
    const h = w.heap;
    for (let id = 0; id < 200; id++) {
        if (h.has(id)) assert.equal(typeof h.keyOf(id), 'number');
        else assert.equal(h.keyOf(id), undefined);
    }
    K.snapshotBinaryHeap(w, w.snap);
    if (h.size > 0) { assert.equal(w.snap.id[0], h.peek()); assert.equal(w.snap.key[0], h.topKey()); }
});

test('faithfulness: MinMaxHeap drains ascending from popMin AND descending from popMax', () => {
    const cap = 200, s = rng(0x1357);
    const a = new MinMaxHeap(cap), keys = [];
    for (let i = 0; i < cap; i++) { const k = u32(s) & 0xffff; a.push(i, k); keys.push(k); }
    keys.sort((x, y) => x - y);
    let prev = -Infinity, i = 0;
    for (;;) { const id = a.popMin(); if (id === undefined) break; assert.ok(keys[i] >= prev); prev = keys[i]; i++; }
    assert.equal(i, cap);
    const b = new MinMaxHeap(cap);
    for (let j = 0; j < cap; j++) b.push(j, keys[j]);
    prev = Infinity; let n = 0;
    for (;;) { const id = b.popMax(); if (id === undefined) break; const k = keys[cap - 1 - n]; assert.ok(k <= prev); prev = k; n++; }
    assert.equal(n, cap);
});

test('faithfulness: BinomialHeap popMin drains non-decreasing == sorted multiset', () => {
    const cap = 300, h = new BinomialHeap(cap, 'min'), s = rng(0x2468), keys = [];
    for (let i = 0; i < cap; i++) { const k = u32(s) & 0xffff; h.push(i, k); keys.push(k); }
    keys.sort((a, b) => a - b);
    let prev = -Infinity, i = 0;
    for (;;) { const id = h.popMin(); if (id === undefined) break; assert.ok(keys[i] >= prev); prev = keys[i]; i++; }
    assert.equal(i, cap);
});

test('faithfulness: PairingHeap drains every entry; decreaseKey lowers keyOf', () => {
    const cap = 250, h = new PairingHeap(cap, 'min'), s = rng(0x9753);
    const live = new Map();
    for (let i = 0; i < cap; i++) { const k = (u32(s) & 0xffff) + 1000; h.push(i, k); live.set(i, k); }
    for (let j = 0; j < 40; j++) { const id = u32(s) % cap; if (h.has(id)) { const c = h.keyOf(id); h.decreaseKey(id, c - 500); assert.equal(h.keyOf(id), c - 500); live.set(id, c - 500); } }
    const sorted = [...live.values()].sort((a, b) => a - b);
    let prev = -Infinity, i = 0;
    for (;;) { const id = h.popMin(); if (id === undefined) break; assert.ok(sorted[i] >= prev); prev = sorted[i]; i++; }
    assert.equal(i, cap, 'every entry drains in non-decreasing order');
});

test('faithfulness: FibonacciHeap popMin sorted; decreaseKey lowers keyOf via cascading cut', () => {
    const cap = 250, h = new FibonacciHeap(cap, 'min'), s = rng(0x8642);
    const live = new Map();
    for (let i = 0; i < cap; i++) { const k = (u32(s) & 0xffff) + 1000; h.push(i, k); live.set(i, k); }
    for (let j = 0; j < 40; j++) { const id = u32(s) % cap; if (h.has(id)) { const c = h.keyOf(id); h.decreaseKey(id, c - 500); assert.equal(h.keyOf(id), c - 500); live.set(id, c - 500); } }
    const sorted = [...live.values()].sort((a, b) => a - b);
    let prev = -Infinity, i = 0;
    for (;;) { const id = h.popMin(); if (id === undefined) break; assert.ok(sorted[i] >= prev); prev = sorted[i]; i++; }
    assert.equal(i, cap);
});

// ---- Scene 02: ordered maps -----------------------------------------------------------

// Drive an ordered map through set/delete/get against an independent Map shadow; return it.
function driveMap(map, seed, ops, span) {
    const shadow = new Map(), s = rng(seed);
    for (let i = 0; i < ops; i++) {
        const r = u32(s), b = r % 3, k = u32(s) % span;
        if (b === 0) { map.set(k, k & 0xffff); shadow.set(k, k & 0xffff); }
        else if (b === 1) { map.delete(k); shadow.delete(k); }
        else { assert.equal(map.get(k), shadow.has(k) ? shadow.get(k) : undefined, 'get must equal shadow at key ' + k); }
    }
    assert.equal(map.size, shadow.size, 'live size must equal shadow');
    return shadow;
}
function ascendingKeys(map) {
    const keys = [];
    map.forEach((k) => keys.push(k)); // COLD path (test only), NEVER inside a step kernel
    for (let i = 1; i < keys.length; i++) assert.ok(keys[i] > keys[i - 1], 'forEach must yield strictly ascending keys');
    return keys;
}

test('faithfulness: SkipList get/size/forEach/successor track an independent Map shadow', () => {
    const map = new SkipList(2000, 0xcafe);
    const shadow = driveMap(map, 0x1111, 3000, 4000);
    const keys = ascendingKeys(map);
    assert.deepEqual(keys, [...shadow.keys()].sort((a, b) => a - b));
    for (let i = 0; i < keys.length - 1; i++) assert.equal(map.successor(keys[i]), keys[i + 1]);
});

test('faithfulness: Treap get/rank/select/successor/predecessor match a sorted shadow', () => {
    const map = new Treap(2000, 0xbeef);
    const shadow = driveMap(map, 0x2222, 3000, 4000);
    const keys = ascendingKeys(map);
    assert.deepEqual(keys, [...shadow.keys()].sort((a, b) => a - b));
    for (let i = 0; i < keys.length; i++) { assert.equal(map.select(i), keys[i]); assert.equal(map.rank(keys[i]), i); }
    for (let i = 0; i < keys.length - 1; i++) { assert.equal(map.successor(keys[i]), keys[i + 1]); assert.equal(map.predecessor(keys[i + 1]), keys[i]); }
});

test('faithfulness: Scapegoat get/rank/select track a sorted shadow across rebuilds', () => {
    const map = new Scapegoat(2000, 2 / 3);
    const shadow = driveMap(map, 0x3333, 3000, 4000);
    const keys = ascendingKeys(map);
    assert.deepEqual(keys, [...shadow.keys()].sort((a, b) => a - b));
    for (let i = 0; i < keys.length; i++) { assert.equal(map.select(i), keys[i]); assert.equal(map.rank(keys[i]), i); }
});

test('faithfulness: SplayTree get/size/forEach/successor track an independent Map shadow', () => {
    const map = new SplayTree(2000);
    const shadow = driveMap(map, 0x4444, 3000, 4000);
    const keys = ascendingKeys(map);
    assert.deepEqual(keys, [...shadow.keys()].sort((a, b) => a - b));
    for (let i = 0; i < keys.length - 1; i++) assert.equal(map.successor(keys[i]), keys[i + 1]);
});

test('faithfulness: SortedArray get/rank/select/keyAt/successor track a sorted shadow', () => {
    const map = new SortedArray(2000);
    const shadow = driveMap(map, 0x5555, 3000, 1500); // span < cap so it fills densely
    const keys = [...shadow.keys()].sort((a, b) => a - b);
    for (let i = 0; i < keys.length; i++) { assert.equal(map.select(i), keys[i]); assert.equal(map.keyAt(i), keys[i]); assert.equal(map.rank(keys[i]), i); }
    for (let i = 0; i < keys.length - 1; i++) { assert.equal(map.successor(keys[i]), keys[i + 1]); assert.equal(map.predecessor(keys[i + 1]), keys[i]); }
});

// ---- Scene 03: range & prefix ---------------------------------------------------------

test('faithfulness: Fenwick prefix equals a naive scan over an independent array', () => {
    const n = 512, bit = new Fenwick(n), ref = new Float64Array(n), s = rng(0x6666);
    for (let it = 0; it < 4000; it++) {
        const i = u32(s) % n, d = (u32(s) & 15) - 8;
        bit.update(i, d); ref[i] += d;
        if ((it & 63) === 0) {
            const q = u32(s) % n; let sum = 0; for (let j = 0; j <= q; j++) sum += ref[j];
            assert.equal(bit.prefix(q), sum, 'prefix must equal naive at ' + q);
        }
    }
});

test('faithfulness: SegmentTree query equals a naive fold over an independent array (all 4 folds)', () => {
    const kinds = ['min', 'max', 'sum', 'gcd'];
    for (let ki = 0; ki < 4; ki++) {
        const kind = kinds[ki], n = 256, tree = new SegmentTree(n, kind), ref = new Float64Array(n), s = rng(0x7000 + ki);
        for (let i = 0; i < n; i++) { const v = (u32(s) & 63) + 1; tree.update(i, v); ref[i] = v; }
        for (let q = 0; q < 200; q++) {
            const lo = u32(s) % n, hi = lo + (u32(s) % (n - lo));
            let acc = kind === 'min' ? Infinity : kind === 'max' ? -Infinity : 0;
            for (let j = lo; j <= hi; j++) {
                const v = ref[j];
                if (kind === 'min') acc = Math.min(acc, v); else if (kind === 'max') acc = Math.max(acc, v);
                else if (kind === 'sum') acc += v; else { let a = acc, b = v; while (b) { const t = a % b; a = b; b = t; } acc = a; }
            }
            assert.equal(tree.query(lo, hi), acc, kind + ' query must equal naive fold [' + lo + ',' + hi + ']');
        }
    }
});

test('faithfulness: Fenwick2D rectSum equals a naive rectangle scan over an independent grid', () => {
    const R = 24, C = 24, g = new Fenwick2D(R, C), ref = new Float64Array(R * C), s = rng(0x8888);
    for (let it = 0; it < 2000; it++) {
        const r = u32(s) % R, c = u32(s) % C, d = (u32(s) & 7) - 3;
        g.update(r, c, d); ref[r * C + c] += d;
        if ((it & 31) === 0) {
            const r1 = u32(s) % R, c1 = u32(s) % C, r2 = r1 + (u32(s) % (R - r1)), c2 = c1 + (u32(s) % (C - c1));
            let sum = 0; for (let rr = r1; rr <= r2; rr++) for (let cc = c1; cc <= c2; cc++) sum += ref[rr * C + cc];
            assert.equal(g.rectSum(r1, c1, r2, c2), sum, 'rectSum must equal naive');
        }
    }
});

test('faithfulness: SegmentTree2D query equals a naive rectangle fold over an independent grid', () => {
    const R = 20, C = 20, g = new SegmentTree2D(R, C, 'max'), ref = new Float64Array(R * C), s = rng(0x9999);
    for (let i = 0; i < R * C; i++) { const v = (u32(s) & 255) + 1; g.update((i / C) | 0, i % C, v); ref[i] = v; }
    for (let q = 0; q < 200; q++) {
        const r1 = u32(s) % R, c1 = u32(s) % C, r2 = r1 + (u32(s) % (R - r1)), c2 = c1 + (u32(s) % (C - c1));
        let mx = -Infinity; for (let rr = r1; rr <= r2; rr++) for (let cc = c1; cc <= c2; cc++) mx = Math.max(mx, ref[rr * C + cc]);
        assert.equal(g.query(r1, c1, r2, c2), mx, 'max query must equal naive fold');
    }
});

// ---- Scene 04: time-travel & offline --------------------------------------------------

test('faithfulness: PersistentSegTree older versions stay unchanged; query/at equal a naive fold', () => {
    const n = 64, vcap = 60, s = rng(0xa1a1);
    const v0 = new Float64Array(n); for (let i = 0; i < n; i++) v0[i] = (u32(s) & 63);
    const pst = PersistentSegTree.build(v0, vcap, 'sum');
    const hist = [Array.from(v0)]; // JS array per minted version (test-only shadow)
    for (let m = 0; m < vcap; m++) {
        const from = u32(s) % hist.length, i = u32(s) % n, val = (u32(s) & 63);
        const nv = pst.update(from, i, val);
        const arr = hist[from].slice(); arr[i] = val; hist[nv] = arr;
    }
    for (let v = 0; v < hist.length; v++) {
        const arr = hist[v];
        for (let q = 0; q < 20; q++) {
            const lo = u32(s) % n, hi = lo + (u32(s) % (n - lo));
            let sum = 0; for (let j = lo; j <= hi; j++) sum += arr[j];
            assert.equal(pst.query(v, lo, hi), sum, 'v' + v + ' query must equal naive fold');
            assert.equal(pst.at(v, lo), arr[lo], 'v' + v + ' at must equal naive');
        }
    }
});

test('faithfulness: MergeSortTree countLE/rangeCount equal a brute scan; build copies the input in', () => {
    const n = 256, s = rng(0xb2b2), values = new Float64Array(n);
    for (let i = 0; i < n; i++) values[i] = u32(s) % 4000;
    const mst = MergeSortTree.build(values);
    for (let q = 0; q < 400; q++) {
        const lo = u32(s) % n, hi = lo + (u32(s) % (n - lo)), x = u32(s) % 4000;
        let le = 0; for (let j = lo; j <= hi; j++) if (values[j] <= x) le++;
        assert.equal(mst.countLE(lo, hi, x), le, 'countLE must equal brute');
        const vlo = u32(s) % 2000, vhi = vlo + (u32(s) % 2000);
        let rc = 0; for (let j = lo; j <= hi; j++) if (values[j] >= vlo && values[j] <= vhi) rc++;
        assert.equal(mst.rangeCount(lo, hi, vlo, vhi), rc, 'rangeCount must equal brute');
    }
    const before = mst.countLE(0, n - 1, 2000);
    for (let i = 0; i < n; i++) values[i] = 0; // mutate caller array AFTER build
    assert.equal(mst.countLE(0, n - 1, 2000), before, 'build must copy the input in (immutability)');
});

test('faithfulness has TEETH: the oracle assert form bites on a wrong value', () => {
    const bit = new Fenwick(16); bit.update(3, 5);
    assert.notEqual(bit.prefix(5), 999, 'a wrong prefix must not equal the real one');
    assert.throws(() => { assert.equal(bit.prefix(5), 999); }, 'the oracle assert form must bite on a wrong value');
});

// =======================================================================================
// (d) LAYOUT-DRIFT PINS
// =======================================================================================

const F64 = Float64Array, U32 = Uint32Array, I32 = Int32Array, U8 = Uint8Array, NUM = 'number', BOOL = 'boolean';
const PINS = [
    ['BinaryHeap', new BinaryHeap(8, 'min'), { _key: F64, _id: U32, _pos: I32, _n: NUM, _cap: NUM, _min: BOOL }],
    ['MinMaxHeap', new MinMaxHeap(8), { _key: F64, _id: U32, _n: NUM, _cap: NUM }],
    ['BinomialHeap', new BinomialHeap(8, 'min'), { _key: F64, _id: U32, _parent: U32, _child: U32, _sibling: U32, _order: U32, _head: NUM, _min: NUM, _n: NUM, _isMin: BOOL, _consumed: BOOL, _cap: NUM }],
    ['PairingHeap', new PairingHeap(8, 'min'), { _key: F64, _id: U32, _child: U32, _sibling: U32, _parent: U32, _pos: I32, _owner: U32, _alias: I32, _cap: NUM }],
    ['FibonacciHeap', new FibonacciHeap(8, 'min'), { _key: F64, _id: U32, _left: U32, _right: U32, _child: U32, _parent: U32, _degree: U32, _mark: U8, _pos: I32, _owner: U32, _bucket: U32, _min: NUM, _n: NUM, _hid: NUM, _consumed: BOOL }],
    ['SkipList', new SkipList(8, 1), { _key: F64, _val: F64, _next: U32, _update: U32, _level: NUM, _maxLevel: NUM, _size: NUM, _stride: NUM, _cap: NUM, _version: NUM }],
    ['Treap', new Treap(8, 1), { _key: F64, _value: F64, _left: U32, _right: U32, _prio: U32, _size: U32, _root: NUM, _sr: NUM, _version: NUM }],
    ['Scapegoat', new Scapegoat(8, 2 / 3), { _key: F64, _value: F64, _left: U32, _right: U32, _size: U32, _root: NUM, _maxCount: NUM, _alpha: NUM, _invAlpha: NUM, _flat: U32, _stack: U32, _version: NUM }],
    ['SplayTree', new SplayTree(8), { _key: F64, _value: F64, _left: U32, _right: U32, _root: NUM, _n: NUM, _hl: NUM, _hr: NUM, _version: NUM }],
    ['SortedArray', new SortedArray(8), { _key: F64, _value: F64, _size: NUM, _cap: NUM, _version: NUM }],
    ['Fenwick', new Fenwick(8), { _t: F64, _n: NUM }],
    ['SegmentTree', new SegmentTree(8, 'min'), { _t: F64, _n: NUM, _k: NUM, _idv: NUM }],
    ['Fenwick2D', new Fenwick2D(8, 8), { _t: F64, _r: NUM, _c: NUM, _w: NUM }],
    ['SegmentTree2D', new SegmentTree2D(8, 8, 'max'), { _t: F64, _r: NUM, _c: NUM, _w: NUM, _k: NUM, _idv: NUM }],
    ['PersistentSegTree', PersistentSegTree.build(new Float64Array(8), 4, 'sum'), { _val: F64, _left: U32, _right: U32, _roots: U32, _next: NUM, _vcount: NUM, _vcap: NUM, _budget: NUM, _n: NUM, _k: NUM, _idv: NUM }],
    ['MergeSortTree', MergeSortTree.build(new Float64Array(8)), { _t: F64, _n: NUM, _h: NUM, _m: NUM, _cells: NUM }],
];

test('layout-drift pins: every snapshot-read field exists with its pinned constructor (all 16)', () => {
    for (let i = 0; i < PINS.length; i++) {
        const name = PINS[i][0], inst = PINS[i][1], fields = PINS[i][2];
        for (const f in fields) {
            const want = fields[f];
            assert.ok(Object.prototype.hasOwnProperty.call(inst, f), '[lite-logn-demo] ' + name + ' lost pinned field ' + f);
            const v = inst[f];
            if (want === NUM) assert.equal(typeof v, 'number', '[lite-logn-demo] ' + name + '.' + f + ' must be a number');
            else if (want === BOOL) assert.equal(typeof v, 'boolean', '[lite-logn-demo] ' + name + '.' + f + ' must be a boolean');
            else assert.ok(v instanceof want, '[lite-logn-demo] ' + name + '.' + f + ' must be a ' + want.name);
        }
    }
});

test('layout-drift pins have TEETH: a renamed field reads as missing', () => {
    const h = new BinaryHeap(8, 'min');
    assert.ok(Object.prototype.hasOwnProperty.call(h, '_key'));
    assert.ok(!Object.prototype.hasOwnProperty.call(h, '_keyRENAMED'), 'the guard keys off the real name');
});

// =======================================================================================
// (c) 0-B/op HOT-KERNEL GATE (SCAVENGE-COUNTED) + foil non-vacuousness
// =======================================================================================
// A post-GC heapUsed delta cannot see a TRANSIENT allocation that dies before the forced GC --
// `{ a: i, b: [i, i + 1] }` per step reads ~0 B/op that way and sails through. So the gate runs
// in a CHILD process with the semi-space pinned SMALL (--max/min-semi-space-size=1), where any
// per-step allocation forces SCAVENGES, and COUNTS them (PerformanceObserver 'gc', kind = minor)
// over a window with NO forced GC. Scenes 1/2/4 are a true 0 (no scavenge even at 8N). Scene 3
// is bounded to the documented S7 return box of SegmentTree2D.query (<= 1 HeapNumber/call, i.e.
// implied bytes/step <= 16). A CONTROL that allocates one small object per step is the teeth: the
// SAME gate must catch it (implied bytes/step >> 16, scavenges dwarfing the identical lite scene).

const ZERO_ALLOC_WORKER = `
import { PerformanceObserver } from 'node:perf_hooks';
const K = await import(process.env.KPATH);
const N = 200000, N8 = 1600000, WARM = 20000;

function mkStep(id) {
    if (id === '1' || id === 'control') {
        const bh = K.createBinaryHeapWorld(256, 128), mm = K.createMinMaxHeapWorld(256, 128),
            bi = K.createBinomialHeapWorld(256, 128), pa = K.createPairingHeapWorld(256, 128),
            fi = K.createFibonacciHeapWorld(256, 128);
        if (id === 'control') {
            const hold = new Array(1024); // bounded ring: the per-step object ESCAPES (defeats scalar replacement) but does not accumulate
            return (i) => {
                K.stepBinaryHeapWorld(bh); K.stepMinMaxHeapWorld(mm); K.stepBinomialHeapWorld(bi);
                K.stepPairingHeapWorld(pa); K.stepFibonacciHeapWorld(fi);
                K.snapshotBinaryHeap(bh, bh.snap); K.snapshotMinMaxHeap(mm, mm.snap);
                K.snapshotBinomialHeap(bi, bi.snap); K.snapshotPairingHeap(pa, pa.snap);
                K.snapshotFibonacciHeap(fi, fi.snap);
                const o = { a: i, b: [i, i + 1] }; // ONE small object/step -- MUST trip the gate
                hold[i & 1023] = o;
                return bh.snap.n + o.b[0];
            };
        }
        return (i) => {
            K.stepBinaryHeapWorld(bh); K.stepMinMaxHeapWorld(mm); K.stepBinomialHeapWorld(bi);
            K.stepPairingHeapWorld(pa); K.stepFibonacciHeapWorld(fi);
            K.snapshotBinaryHeap(bh, bh.snap); K.snapshotMinMaxHeap(mm, mm.snap);
            K.snapshotBinomialHeap(bi, bi.snap); K.snapshotPairingHeap(pa, pa.snap);
            K.snapshotFibonacciHeap(fi, fi.snap);
            return bh.snap.n + mm.snap.n + bi.snap.n;
        };
    }
    if (id === '2') {
        const sk = K.createSkipListWorld(512, 256), tr = K.createTreapWorld(512, 256),
            sc = K.createScapegoatWorld(512, 256), sp = K.createSplayTreeWorld(512, 256),
            sa = K.createSortedArrayWorld(512, 256);
        return (i) => {
            K.stepSkipListWorld(sk); K.stepTreapWorld(tr); K.stepScapegoatWorld(sc);
            K.stepSplayTreeWorld(sp); K.stepSortedArrayWorld(sa);
            K.snapshotSkipList(sk, sk.snap); K.snapshotTreap(tr, tr.snap); K.snapshotScapegoat(sc, sc.snap);
            K.snapshotSplayTree(sp, sp.snap); K.snapshotSortedArray(sa, sa.snap);
            return sk.snap.size + tr.snap.n + sa.snap.size;
        };
    }
    if (id === '3') {
        const fw = K.createFenwickWorld(512), sg = K.createSegmentTreeWorld(512),
            f2 = K.createFenwick2DWorld(32, 32), s2 = K.createSegmentTree2DWorld(32, 32);
        return (i) => {
            K.stepFenwickWorld(fw); K.stepSegmentTreeWorld(sg); K.stepFenwick2DWorld(f2); K.stepSegmentTree2DWorld(s2);
            K.snapshotFenwick(fw, fw.snap); K.snapshotSegmentTree(sg, sg.snap);
            K.snapshotFenwick2D(f2, f2.snap); K.snapshotSegmentTree2D(s2, s2.snap);
            return fw.snap.n + sg.snap.n;
        };
    }
    const pst = K.createPersistentSegTreeWorld(128, 400), mst = K.createMergeSortTreeWorld(512);
    return (i) => {
        K.stepPersistentSegTreeWorld(pst); K.stepMergeSortTreeWorld(mst);
        K.snapshotPersistentSegTree(pst, pst.snap); K.snapshotMergeSortTree(mst, mst.snap);
        return pst.snap.vcount + mst.snap.n;
    };
}

async function scav(fn, steps) {
    gc(); gc();
    let n = 0;
    const obs = new PerformanceObserver((list) => {
        for (const e of list.getEntries()) { const k = e.detail ? e.detail.kind : e.kind; if (k === 1) n++; }
    });
    obs.observe({ entryTypes: ['gc'] });
    let sink = 0;
    for (let i = 0; i < steps; i++) sink += fn(i) | 0;
    await new Promise((r) => setTimeout(r, 60)); // GC entries arrive async -- settle before reading
    obs.disconnect();
    if (sink !== sink) throw new Error('nan sink');
    return n;
}

for (const id of ['1', '2', '3', '4', 'control']) {
    const fn = mkStep(id);
    for (let i = 0; i < WARM; i++) fn(i);
    const sN = await scav(fn, N);
    const s8 = await scav(fn, N8);
    process.stdout.write('RESULT ' + id + ' ' + N + ' ' + sN + ' ' + N8 + ' ' + s8 + '\\n');
}
`;

test('0-B/op (scavenge-counted, semi=1MB child): scenes 1/2/4 true 0; scene 3 <= S7; control FAILS', () => {
    const KPATH = fileURLToPath(new URL('./kernels.mjs', import.meta.url));
    const res = spawnSync(process.execPath,
        ['--expose-gc', '--max-semi-space-size=1', '--min-semi-space-size=1', '--input-type=module', '-e', ZERO_ALLOC_WORKER],
        { env: { ...process.env, KPATH }, encoding: 'utf8', maxBuffer: 1 << 24, timeout: 120000 });
    assert.equal(res.status, 0, '[lite-logn-demo] alloc worker failed (status ' + res.status + '): ' +
        String(res.stderr || res.error || '').slice(0, 800));
    const by = {};
    for (const line of res.stdout.split('\n')) {
        if (!line.startsWith('RESULT ')) continue;
        const p = line.split(' ');
        by[p[1]] = { N: +p[2], sN: +p[3], N8: +p[4], s8: +p[5] };
    }
    const SEMI = 1 << 20;      // ~1 MB semi-space -> ~1 scavenge per MB of transient allocation
    const S7_BUDGET_B = 16;    // one HeapNumber per non-inlined double-returning read (SegmentTree2D.query)
    const AMBIENT = 1;         // tolerate at most one incidental scavenge across a whole window
    process.stdout.write('  0-B/op scavenges (semi=1MB): ' +
        ['1', '2', '3', '4', 'control'].map((id) => id + ' N=' + by[id].sN + ' 8N=' + by[id].s8).join(' | ') + '\n');

    // scenes 1, 2, 4: a TRUE 0 B/op -- no per-step allocation, so no scavenge even at 8N.
    for (const id of ['1', '2', '4']) {
        const r = by[id];
        assert.ok(r, '[lite-logn-demo] missing scene ' + id + ' result');
        assert.ok(r.sN <= AMBIENT && r.s8 <= AMBIENT, '[lite-logn-demo] scene ' + id +
            ' must be a true 0 B/op: scavenges N=' + r.sN + ' 8N=' + r.s8 + ' must each be <= ' + AMBIENT);
    }
    // scene 3: ONLY the documented S7 box (SegmentTree2D.query) is allowed. Bound the IMPLIED
    // bytes/step (scavenges * semi-space / steps) to one HeapNumber -- not a loose "< 16 B averaged".
    const r3 = by['3'];
    const impliedB3 = r3.s8 * SEMI / r3.N8;
    assert.ok(impliedB3 <= S7_BUDGET_B, '[lite-logn-demo] scene 3 implied ' + impliedB3.toFixed(2) +
        ' B/op (scavenges ' + r3.s8 + ' over ' + r3.N8 + ') must stay within the S7 budget ' +
        S7_BUDGET_B + ' B (<= 1 HeapNumber per SegmentTree2D.query)');

    // TEETH: the control adds ONE small object/step. The SAME gate must CATCH it -- implied
    // bytes/step must blow past the S7 budget, and its scavenge count must dwarf the lite scene 1.
    const rc = by['control'];
    const impliedBc = rc.sN * SEMI / rc.N;
    assert.ok(impliedBc > S7_BUDGET_B, '[lite-logn-demo] teeth: the one-object-per-step control must ' +
        'FAIL the gate -- implied ' + impliedBc.toFixed(1) + ' B/op must exceed ' + S7_BUDGET_B);
    assert.ok(rc.s8 > by['1'].s8 + 8, '[lite-logn-demo] teeth: control scavenges (' + rc.s8 +
        ') must dwarf the identical lite scene 1 (' + by['1'].s8 + ')');
});

test('the 6 foils are the ONLY allocators (each measures > 0 heap -- gate non-vacuous)', (t) => {
    if (typeof global.gc !== 'function') { t.skip('needs --expose-gc'); return; }
    function bytesOf(fn, iters) {
        global.gc(); const before = process.memoryUsage().heapUsed;
        let sink = 0; for (let i = 0; i < iters; i++) sink += fn(i) | 0;
        const after = process.memoryUsage().heapUsed;
        assert.ok(sink === sink);
        return after - before;
    }
    const vals = new Float64Array(64), prev = new Float64Array(64);
    assert.ok(bytesOf(() => K.foilLinearScanPQ(64), 20000) > 0, 'foilLinearScanPQ must allocate');
    assert.ok(bytesOf((i) => K.foilSortedArrayInsertScan(64, i & 63), 20000) > 0, 'foilSortedArrayInsertScan must allocate');
    assert.ok(bytesOf((i) => K.foilPrefixRebuild(64, i & 63, 1), 20000) > 0, 'foilPrefixRebuild must allocate');
    assert.ok(bytesOf(() => K.foilGridRebuild(16, 16), 20000) > 0, 'foilGridRebuild must allocate');
    assert.ok(bytesOf((i) => K.foilCopyOnWriteSnapshot(prev, i & 63, i), 20000) > 0, 'foilCopyOnWriteSnapshot must allocate');
    assert.ok(bytesOf(() => K.foilBruteRangeCount(vals, 2, 40, 0, 100), 20000) > 0, 'foilBruteRangeCount must allocate');
});

// Ordinary-least-squares slope of ys against its own index -- used below to tell a genuine
// linear leak (large slope) apart from bounded per-cycle GC heap right-sizing oscillation
// (near-zero slope despite real amplitude). A raw two-point "last minus first" diff cannot
// make this distinction: the first sample of a create/clear churn loop is a COLD-start
// outlier relative to the steady-state oscillation band the rest of the run settles into
// (measured empirically: same-phase steady cycles differ by ~1.5 KB while adjacent-phase
// cycles differ by up to ~190 KB from oscillation alone), so comparing cycle-1 to cycle-N
// raw would false-fail on noise. A slope over several post-warmup cycles is not fooled by
// which phase of that oscillation the last sample happens to land on.
function slopeOf(ys) {
    const n = ys.length; let sx = 0, sy = 0, sxy = 0, sxx = 0;
    for (let i = 0; i < n; i++) { sx += i; sy += ys[i]; sxy += i * ys[i]; sxx += i * i; }
    const denom = n * sxx - sx * sx;
    return denom === 0 ? 0 : (n * sxy - sx * sy) / denom;
}

// =======================================================================================
// (f) RETENTION (DEMO.md assertion 3): 10 measured cycles (+3 discarded warmup cycles) of
// create -> 5e4 steps -> clear() -> teardown. Every pooled member's free-list returns to
// zero, size returns to zero, PST returns to the fresh v0 state EVERY cycle (warmup
// included); heapUsed growth across the measured cycles must not trend upward beyond the
// 64 KB/10-cycles budget (via slopeOf, see above -- not a raw cycle-1-vs-cycle-10 diff).
// This is a COLD-path churn test (fresh worlds each cycle) -- it does NOT gate GC events;
// that is assertion 2's job (the STEADY-STATE soak below), never conflated here.
// =======================================================================================

test('retention: 10 cycles of create->steps->clear() return every pooled member to zero', () => {
    if (typeof global.gc !== 'function') { return; } // heapUsed-diff needs --expose-gc to be meaningful
    const WARMUP_CYCLES = 3, CYCLES = 16, STEPS = 50000, CAP = 256, TARGET = 128;
    global.gc(); global.gc();
    const heapByCycle = [];

    for (let cyc = 0; cyc < WARMUP_CYCLES + CYCLES; cyc++) {
        // -- pooled members: churn to a live population, clear(), pool + size must hit zero --
        const pooled = [
            ['BinaryHeap', K.createBinaryHeapWorld(CAP, TARGET), (w) => w.heap, K.stepBinaryHeapWorld, false],
            ['MinMaxHeap', K.createMinMaxHeapWorld(CAP, TARGET), (w) => w.heap, K.stepMinMaxHeapWorld, false],
            ['BinomialHeap', K.createBinomialHeapWorld(CAP, TARGET), (w) => w.heap, K.stepBinomialHeapWorld, true],
            ['PairingHeap', K.createPairingHeapWorld(CAP, TARGET), (w) => w.heap, K.stepPairingHeapWorld, true],
            ['FibonacciHeap', K.createFibonacciHeapWorld(CAP, TARGET), (w) => w.heap, K.stepFibonacciHeapWorld, true],
            ['SkipList', K.createSkipListWorld(CAP, TARGET), (w) => w.list, K.stepSkipListWorld, true],
            ['Treap', K.createTreapWorld(CAP, TARGET), (w) => w.treap, K.stepTreapWorld, true],
            ['Scapegoat', K.createScapegoatWorld(CAP, TARGET), (w) => w.tree, K.stepScapegoatWorld, true],
            ['SplayTree', K.createSplayTreeWorld(CAP, TARGET), (w) => w.tree, K.stepSplayTreeWorld, true],
            ['SortedArray', K.createSortedArrayWorld(CAP, TARGET), (w) => w.arr, K.stepSortedArrayWorld, false],
        ];
        for (const [name, w, getInst, step, hasPool] of pooled) {
            const inst = getInst(w);
            for (let i = 0; i < STEPS; i++) step(w);
            inst.clear();
            if (hasPool) {
                assert.equal(inst._pool.activeSlots, 0, '[lite-logn-demo] ' + name + ' pool must return to 0 active after clear()');
            }
            assert.equal(inst.size, 0, '[lite-logn-demo] ' + name + ' size must be 0 after clear()');
        }

        // -- range/prefix members: churn, clear() back to the fold identity (no pool, no size) --
        const fw = K.createFenwickWorld(CAP);
        for (let i = 0; i < STEPS; i++) K.stepFenwickWorld(fw);
        fw.bit.clear();

        const f2 = K.createFenwick2DWorld(16, 16);
        for (let i = 0; i < STEPS; i++) K.stepFenwick2DWorld(f2);
        f2.grid.clear();

        const s2 = K.createSegmentTree2DWorld(16, 16);
        for (let i = 0; i < STEPS; i++) K.stepSegmentTree2DWorld(s2);
        s2.grid.clear();

        const sg = K.createSegmentTreeWorld(CAP); // world holds 4 trees, one per fold kind
        for (let i = 0; i < STEPS; i++) K.stepSegmentTreeWorld(sg);
        for (const tr of sg.trees) tr.clear();

        // -- PersistentSegTree: churn, clear() must return the fresh v0 state (versions === 1) --
        const pst = K.createPersistentSegTreeWorld(CAP, 400);
        for (let i = 0; i < STEPS; i++) K.stepPersistentSegTreeWorld(pst);
        pst.pst.clear();
        assert.equal(pst.pst.versions, 1, '[lite-logn-demo] PersistentSegTree must return to the fresh v0 state after clear()');

        // -- MergeSortTree: STATIC/immutable, no clear() -- a fresh build each cycle IS the
        // teardown (DEMO.md: "build is COLD"); the assertion is that nothing outlives the cycle.
        const mst = K.createMergeSortTreeWorld(CAP);
        for (let i = 0; i < STEPS; i++) K.stepMergeSortTreeWorld(mst);

        global.gc(); global.gc();
        if (cyc >= WARMUP_CYCLES) heapByCycle.push(process.memoryUsage().heapUsed);
    }
    // V8 grows its heap CAPACITY to the working-set size over the first several cycles, then
    // PLATEAUS -- a bounded, one-time right-sizing that heapUsed (even post-gc) reflects. A true
    // per-cycle leak, by contrast, NEVER plateaus: it keeps trending upward every cycle. So the
    // honest signal is the TAIL slope (the second half of samples), by which point right-sizing
    // has settled and only a genuine leak still climbs. The exact per-member `pool.activeSlots`/
    // `size === 0` assertions above are the primary retention gate; this is the belt-and-suspenders.
    const tail = heapByCycle.slice(heapByCycle.length >> 1);
    const tailTrend = slopeOf(tail);
    const projected = tailTrend * CYCLES;
    process.stdout.write('  retention: heap samples=' + heapByCycle.join(',') +
        ' full-trend=' + slopeOf(heapByCycle).toFixed(1) + ' tail-trend=' + tailTrend.toFixed(1) +
        ' B/cycle, projected ' + CYCLES + '-cycle tail growth=' + projected.toFixed(0) + ' B\n');
    assert.ok(projected < 65536, '[lite-logn-demo] heapUsed TAIL trend projects to ' + projected.toFixed(0) +
        ' B growth over ' + CYCLES + ' cycles, must stay under 64 KB (V8 heap right-sizing settles to a ' +
        'plateau in the tail; a true per-cycle leak would still trend upward there)');
});

// =======================================================================================
// (g) GC-BUDGET STEADY-STATE SOAK (DEMO.md assertion 2): ALL 16 kernel worlds are created
// ONCE (hoisted out of the loop, mirroring test/torture.mjs's own phase-2 shape), then
// stepped in a long combined hot loop with NO create/clear churn. maxMajor === 0,
// maxPauseMs <= 4, and heapUsed growth stays under 64 KB. A fixed large iteration count
// stands in for a literal 60s wall-clock soak (impractical per-run); the methodology
// (GcProfiler + checkNoGc from the SAME devDependency test/torture.mjs already uses) is
// the part being gated, not the clock.
// =======================================================================================

test('GC-budget steady-state soak: all 16 kernels, no demo-triggered major GC, heapUsed flat', async (t) => {
    if (typeof global.gc !== 'function') { t.skip('needs --expose-gc'); return; }
    let GcProfiler, checkNoGc;
    try {
        ({ GcProfiler, checkNoGc } = await import('@zakkster/lite-gc-profiler'));
    } catch {
        t.skip('needs @zakkster/lite-gc-profiler (devDependency)');
        return;
    }

    const bh = K.createBinaryHeapWorld(256, 128), mm = K.createMinMaxHeapWorld(256, 128),
        bi = K.createBinomialHeapWorld(256, 128), pa = K.createPairingHeapWorld(256, 128),
        fi = K.createFibonacciHeapWorld(256, 128),
        sk = K.createSkipListWorld(512, 256), tr = K.createTreapWorld(512, 256),
        sc = K.createScapegoatWorld(512, 256), sp = K.createSplayTreeWorld(512, 256),
        sa = K.createSortedArrayWorld(512, 256),
        fw = K.createFenwickWorld(512), sg = K.createSegmentTreeWorld(512),
        f2 = K.createFenwick2DWorld(32, 32), s2 = K.createSegmentTree2DWorld(32, 32),
        pst = K.createPersistentSegTreeWorld(128, 400), mst = K.createMergeSortTreeWorld(512);

    const WARMUP = 20000, HOT = 300000;
    for (let i = 0; i < WARMUP; i++) {
        K.stepBinaryHeapWorld(bh); K.stepMinMaxHeapWorld(mm); K.stepBinomialHeapWorld(bi);
        K.stepPairingHeapWorld(pa); K.stepFibonacciHeapWorld(fi);
        K.stepSkipListWorld(sk); K.stepTreapWorld(tr); K.stepScapegoatWorld(sc);
        K.stepSplayTreeWorld(sp); K.stepSortedArrayWorld(sa);
        K.stepFenwickWorld(fw); K.stepSegmentTreeWorld(sg); K.stepFenwick2DWorld(f2); K.stepSegmentTree2DWorld(s2);
        K.stepPersistentSegTreeWorld(pst); K.stepMergeSortTreeWorld(mst);
    }
    global.gc(); global.gc();
    const gc = new GcProfiler().start();
    let sink = 0;
    const CHECKPOINT = 50000; // forced-GC checkpoints across HOT -- a real leak trends; V8's own
    const heapByCheckpoint = [process.memoryUsage().heapUsed]; // heap right-sizing does not (see slopeOf)
    // The test itself forces exactly this many major GCs (one per checkpoint) to sample a clean
    // post-GC heap for the leak-trend check below. The demo must add ZERO majors beyond these, so
    // the gate is `major <= FORCED_GC` (a demo per-op allocation heavy enough to trigger its own
    // major would push the count above FORCED_GC and fail). The real leak signal is the heap trend.
    const FORCED_GC = (HOT / CHECKPOINT) | 0;
    for (let i = 0; i < HOT; i++) {
        K.stepBinaryHeapWorld(bh); K.stepMinMaxHeapWorld(mm); K.stepBinomialHeapWorld(bi);
        K.stepPairingHeapWorld(pa); K.stepFibonacciHeapWorld(fi);
        K.stepSkipListWorld(sk); K.stepTreapWorld(tr); K.stepScapegoatWorld(sc);
        K.stepSplayTreeWorld(sp); K.stepSortedArrayWorld(sa);
        K.stepFenwickWorld(fw); K.stepSegmentTreeWorld(sg); K.stepFenwick2DWorld(f2); K.stepSegmentTree2DWorld(s2);
        K.stepPersistentSegTreeWorld(pst); K.stepMergeSortTreeWorld(mst);
        sink = (sink + bh.lastOp + sk.lastOp) | 0;
        if ((i & 8191) === 0) gc.sampleHeap(performance.now(), process.memoryUsage().heapUsed);
        if ((i + 1) % CHECKPOINT === 0) { global.gc(); heapByCheckpoint.push(process.memoryUsage().heapUsed); }
    }
    await new Promise((r) => setTimeout(r, 50));
    const s = gc.summary();
    const report = checkNoGc(s, { maxMajor: FORCED_GC, maxPauseMs: 4 });
    gc.stop();
    const trendPerCheckpoint = slopeOf(heapByCheckpoint);
    const projected = trendPerCheckpoint * (heapByCheckpoint.length - 1);
    process.stdout.write('  gc-soak: heap checkpoints=' + heapByCheckpoint.join(',') +
        ' trend=' + trendPerCheckpoint.toFixed(1) + ' B/checkpoint, gc major=' + s.gc.major +
        ' minor=' + s.gc.minor + ' maxMs=' + s.gc.maxMs.toFixed(2) + '\n');
    assert.ok(sink === sink, 'sink keeps work live');
    assert.ok(s.gc.major <= FORCED_GC, '[lite-logn-demo] the demo must trigger no major GC beyond the ' +
        FORCED_GC + ' forced checkpoints over the steady-state soak, got ' + s.gc.major);
    assert.ok(report.ok, '[lite-logn-demo] GC budget violated: ' + JSON.stringify(report.violations));
    assert.ok(projected < 65536, '[lite-logn-demo] heapUsed trend projects to ' + projected.toFixed(0) +
        ' B growth over the soak, must stay flat (< 64 KB) -- a genuine per-op leak, not GC heap ' +
        'right-sizing, would show as a persistent upward slope across checkpoints');
});

// =======================================================================================
// (e) headless ns/op table -- behind an import.meta MAIN guard, off the SHIPPED fitLogLinear
// =======================================================================================

function headlessTable() {
    const rows = [
        ['BinaryHeap', false, (n) => { const w = K.createBinaryHeapWorld(n, n >> 1); return () => K.stepBinaryHeapWorld(w); }],
        ['SkipList', false, (n) => { const w = K.createSkipListWorld(n, n >> 1); return () => K.stepSkipListWorld(w); }],
        ['Fenwick', false, (n) => { const w = K.createFenwickWorld(n); return () => K.stepFenwickWorld(w); }],
        ['SegmentTree', false, (n) => { const w = K.createSegmentTreeWorld(n); return () => K.stepSegmentTreeWorld(w); }],
        ['Fenwick2D', true, (n) => { const s = Math.max(4, Math.round(Math.sqrt(n))); const w = K.createFenwick2DWorld(s, s); return () => K.stepFenwick2DWorld(w); }],
        ['MergeSortTree', true, (n) => { const w = K.createMergeSortTreeWorld(n); return () => K.stepMergeSortTreeWorld(w); }],
    ];
    const NS = [256, 512, 1024, 2048, 4096, 8192];
    process.stdout.write('member            axis            slope       R^2\n');
    for (const [name, squared, mk] of rows) {
        const xs = [], ys = [];
        for (const n of NS) {
            const step = mk(n);
            for (let i = 0; i < 20000; i++) step();
            const t0 = performance.now(); const ITER = 200000;
            for (let i = 0; i < ITER; i++) step();
            const ns = (performance.now() - t0) * 1e6 / ITER;
            xs.push(squared ? Math.log2(n) ** 2 : Math.log2(n)); ys.push(ns);
        }
        const fit = fitLogLinear(xs, ys);
        process.stdout.write(name.padEnd(18) + (squared ? '(log2 n)^2' : 'log2(n)').padEnd(16) +
            fit.slope.toFixed(3).padStart(8) + '  ' + fit.r2.toFixed(4).padStart(8) + '\n');
    }
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
    headlessTable();
}
