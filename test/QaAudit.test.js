/**
 * @zakkster/lite-logn -- cross-cutting QA audit.
 *
 * The suite-law regression guard, independent of any member. At v0.1.0 (the
 * scaffold) it enforces the invariants that must hold before ANY member ships:
 *   - the VERSION trinity (LogN.js const === package.json === llms.txt);
 *   - the frozen export surface (VERSION only, no member yet);
 *   - the six-file pack discipline (files[] exact; repo-only dirs absent);
 *   - no "Karadjov" anywhere in the shipped source / docs;
 *   - ASCII-only source in LogN.js (U+00D7 and U+00B5 the sole exceptions).
 * Each member session appends its coercion / boundary block below.
 */

import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import * as LogNModule from '../LogN.js';
import { VERSION } from '../LogN.js';

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = join(__dirname, '..');

// --- VERSION trinity: LogN.js const === package.json === llms.txt -----------

test('VERSION trinity: LogN.js const, package.json, and llms.txt agree byte-for-byte', () => {
    const pkg = JSON.parse(readFileSync(join(ROOT, 'package.json'), 'utf8'));
    assert.equal(VERSION, pkg.version, 'LogN.js VERSION const !== package.json version');
    const llms = readFileSync(join(ROOT, 'llms.txt'), 'utf8');
    const m = llms.match(/^Version:\s*(\S+)/m);
    assert.ok(m, 'llms.txt must carry a "Version: <x>" header line');
    assert.equal(m[1], VERSION, 'llms.txt Version header !== LogN.js VERSION const');
});

test('VERSION is exactly 0.14.0 at the SortedArray release', () => {
    assert.equal(VERSION, '0.14.0');
});

// --- frozen export surface: VERSION + the shipped members (14 members) --------

test('LogN.js exports exactly VERSION + the fourteen members at v0.14.0 (adds SortedArray)', () => {
    const exportedNames = Object.keys(LogNModule).sort();
    assert.deepEqual(exportedNames, ['BinaryHeap', 'BinomialHeap', 'Fenwick', 'Fenwick2D', 'FibonacciHeap', 'MinMaxHeap', 'PairingHeap', 'Scapegoat', 'SegmentTree', 'SegmentTree2D', 'SkipList', 'SortedArray', 'SplayTree', 'Treap', 'VERSION'],
        'LogN.js export surface drifted from the frozen surface (VERSION + the fourteen members incl SortedArray)');
    assert.equal(typeof VERSION, 'string');
    assert.equal(typeof LogNModule.BinaryHeap, 'function');
    assert.equal(typeof LogNModule.Fenwick, 'function');
    assert.equal(typeof LogNModule.SegmentTree, 'function');
    assert.equal(typeof LogNModule.SkipList, 'function');
    assert.equal(typeof LogNModule.Treap, 'function');
    assert.equal(typeof LogNModule.Scapegoat, 'function');
    assert.equal(typeof LogNModule.MinMaxHeap, 'function');
    assert.equal(typeof LogNModule.SplayTree, 'function');
    assert.equal(typeof LogNModule.BinomialHeap, 'function');
    assert.equal(typeof LogNModule.PairingHeap, 'function');
    assert.equal(typeof LogNModule.FibonacciHeap, 'function');
    assert.equal(typeof LogNModule.Fenwick2D, 'function');
    assert.equal(typeof LogNModule.SegmentTree2D, 'function');
    assert.equal(typeof LogNModule.SortedArray, 'function');
});

// --- six-file pack discipline (D-07 / decisions/0003) -----------------------

test('package.json files[] ships exactly the six shipped files', () => {
    const pkg = JSON.parse(readFileSync(join(ROOT, 'package.json'), 'utf8'));
    const expected = ['LogN.js', 'LogN.d.ts', 'llms.txt', 'README.md', 'CHANGELOG.md', 'LICENSE'];
    assert.deepEqual([...pkg.files].sort(), [...expected].sort(),
        'files[] drifted from the six shipped files');
});

test('files[] contains none of the repo-only paths', () => {
    const pkg = JSON.parse(readFileSync(join(ROOT, 'package.json'), 'utf8'));
    const repoOnly = ['test', 'benchmark', 'decisions', 'demo', 'ROADMAP.md', 'RESEARCH.md', 'GUIDE.md'];
    for (const f of pkg.files) {
        for (const banned of repoOnly) {
            assert.ok(!f.startsWith(banned),
                'files[] must not ship the repo-only path ' + f);
        }
    }
});

// --- no "Karadjov" anywhere in the shipped source / docs --------------------

test('no "Karadjov" in the shipped files (the name is always Shinikchiev)', () => {
    const files = ['LogN.js', 'LogN.d.ts', 'llms.txt', 'README.md', 'CHANGELOG.md', 'LICENSE', 'package.json'];
    for (const f of files) {
        const text = readFileSync(join(ROOT, f), 'utf8');
        assert.ok(!/Karadjov/i.test(text), f + ' must not contain "Karadjov"');
    }
    // the copyright holder is spelled correctly where attribution lives
    const license = readFileSync(join(ROOT, 'LICENSE'), 'utf8');
    assert.ok(/Zahary Shinikchiev/.test(license), 'LICENSE must credit Zahary Shinikchiev');
    const pkg = JSON.parse(readFileSync(join(ROOT, 'package.json'), 'utf8'));
    assert.ok(/Zahary Shinikchiev/.test(pkg.author), 'package.json author must be Zahary Shinikchiev');
});

// --- ASCII-only source in LogN.js (U+00D7 x, U+00B5 mu excepted) -------------

test('LogN.js is ASCII-only (U+00D7 and U+00B5 the sole permitted exceptions)', () => {
    const src = readFileSync(join(ROOT, 'LogN.js'), 'utf8');
    let bad = 0;
    for (let i = 0; i < src.length; i++) {
        const c = src.charCodeAt(i);
        if (c > 0x7f && c !== 0x00d7 && c !== 0x00b5) {
            bad++;
        }
    }
    assert.equal(bad, 0, 'LogN.js contains ' + bad + ' non-ASCII code unit(s) outside x / mu');
});

// --- member coercion / boundary blocks land below (one per member) ----------

// --- Fenwick (v0.2.0): coercion + [lite-logn] fail-closed tag ----------------

test('Fenwick fails closed with a [lite-logn]-tagged throw on every coercion door', () => {
    const { Fenwick } = LogNModule;
    // constructor: bad length (typeof-guarded before coercion; Symbol/BigInt-safe)
    for (const bad of [0, -1, 1.5, NaN, Infinity, '8', null, undefined, Symbol('x')]) {
        assert.throws(() => new Fenwick(bad), /\[lite-logn\]/, 'ctor ' + String(bad));
    }
    const f = new Fenwick(8);
    // non-finite / non-number delta and value, typeof-first (no Symbol coercion)
    for (const bad of [NaN, Infinity, -Infinity, '5', null, undefined, {}, Symbol('k')]) {
        assert.throws(() => f.update(0, bad), /\[lite-logn\]/, 'update delta ' + String(bad));
        assert.throws(() => f.set(0, bad), /\[lite-logn\]/, 'set value ' + String(bad));
    }
    // out-of-range indices on every index-taking op
    for (const bad of [-1, 8, 100, 1.5, NaN, '0', null, Symbol('i')]) {
        assert.throws(() => f.update(bad, 1), /\[lite-logn\]/, 'update i ' + String(bad));
        assert.throws(() => f.at(bad), /\[lite-logn\]/, 'at ' + String(bad));
        assert.throws(() => f.set(bad, 1), /\[lite-logn\]/, 'set i ' + String(bad));
        assert.throws(() => f.rangeSum(bad, 7), /\[lite-logn\]/, 'rangeSum lo ' + String(bad));
    }
    // prefix admits -1 (the empty-prefix base case) but rejects other sub-zero
    assert.equal(f.prefix(-1), 0);
    assert.throws(() => f.prefix(-2), /\[lite-logn\]/);
    // rangeSum lo > hi fails closed; build fails closed on bad input
    assert.throws(() => f.rangeSum(5, 2), /\[lite-logn\]/);
    assert.throws(() => Fenwick.build(null), /\[lite-logn\]/);
    assert.throws(() => Fenwick.build([1, NaN]), /\[lite-logn\]/);
});

// --- SegmentTree (v0.3.0): coercion + [lite-logn] fail-closed tag -------------

test('SegmentTree fails closed with a [lite-logn]-tagged throw on every coercion door', () => {
    const { SegmentTree } = LogNModule;
    // constructor: bad length (typeof-guarded before coercion; Symbol/BigInt-safe)
    for (const bad of [0, -1, 1.5, NaN, Infinity, '8', null, undefined, Symbol('x'), 2 ** 30]) {
        assert.throws(() => new SegmentTree(bad, 'sum'), /\[lite-logn\]/, 'ctor length ' + String(bad));
    }
    // constructor: bad kind
    for (const bad of ['product', 'MIN', '', null, undefined, 0, Symbol('k'), {}]) {
        assert.throws(() => new SegmentTree(8, bad), /\[lite-logn\]/, 'ctor kind ' + String(bad));
    }
    const st = new SegmentTree(8, 'sum');
    // non-finite / non-number value, typeof-first (no Symbol coercion)
    for (const bad of [NaN, Infinity, -Infinity, '5', null, undefined, {}, Symbol('v'), 3n]) {
        assert.throws(() => st.update(0, bad), /\[lite-logn\]/, 'update value ' + String(bad));
    }
    // out-of-range indices on every index-taking op
    for (const bad of [-1, 8, 100, 1.5, NaN, '0', null, Symbol('i')]) {
        assert.throws(() => st.update(bad, 1), /\[lite-logn\]/, 'update i ' + String(bad));
        assert.throws(() => st.at(bad), /\[lite-logn\]/, 'at ' + String(bad));
        assert.throws(() => st.query(bad, 7), /\[lite-logn\]/, 'query lo ' + String(bad));
        assert.throws(() => st.query(0, bad), /\[lite-logn\]/, 'query hi ' + String(bad));
    }
    // query lo > hi fails closed; the gcd kind constrains its value domain
    assert.throws(() => st.query(5, 2), /\[lite-logn\]/);
    const g = new SegmentTree(8, 'gcd');
    for (const bad of [-1, 1.5, NaN, '4', Symbol('g')]) {
        assert.throws(() => g.update(0, bad), /\[lite-logn\]/, 'gcd value ' + String(bad));
    }
    // build fails closed on bad input
    assert.throws(() => SegmentTree.build(null, 'sum'), /\[lite-logn\]/);
    assert.throws(() => SegmentTree.build([1, NaN], 'sum'), /\[lite-logn\]/);
    assert.throws(() => SegmentTree.build([1, 2], 'bad'), /\[lite-logn\]/);
    assert.throws(() => SegmentTree.build([4, -2], 'gcd'), /\[lite-logn\]/);
});

// --- SkipList (v0.4.0): coercion + [lite-logn] fail-closed tag ----------------

test('SkipList fails closed with a [lite-logn]-tagged throw on every coercion door', () => {
    const { SkipList } = LogNModule;
    // constructor: bad capacity (typeof-guarded before coercion; Symbol/BigInt-safe)
    for (const bad of [0, -1, 1.5, NaN, Infinity, '8', null, undefined, Symbol('x'), 0x04000000]) {
        assert.throws(() => new SkipList(bad), /\[lite-logn\]/, 'ctor capacity ' + String(bad));
    }
    // constructor: bad seed (unsigned 32-bit integer only)
    for (const bad of [-1, 1.5, NaN, Infinity, '7', null, {}, Symbol('s'), 3n, 0x100000000]) {
        assert.throws(() => new SkipList(8, bad), /\[lite-logn\]/, 'ctor seed ' + String(bad));
    }
    const sl = new SkipList(8, 1);
    // non-finite / non-number key, typeof-first (no Symbol / BigInt coercion)
    for (const bad of [NaN, Infinity, -Infinity, '5', null, undefined, {}, Symbol('k'), 3n]) {
        assert.throws(() => sl.get(bad), /\[lite-logn\]/, 'get ' + String(bad));
        assert.throws(() => sl.set(bad, 1), /\[lite-logn\]/, 'set key ' + String(bad));
        assert.throws(() => sl.delete(bad), /\[lite-logn\]/, 'delete ' + String(bad));
        assert.throws(() => sl.successor(bad), /\[lite-logn\]/, 'successor ' + String(bad));
        assert.throws(() => sl.predecessor(bad), /\[lite-logn\]/, 'predecessor ' + String(bad));
    }
    // non-finite / non-number value, typeof-first
    for (const bad of [NaN, Infinity, -Infinity, '5', null, undefined, {}, Symbol('v'), 3n]) {
        assert.throws(() => sl.set(0, bad), /\[lite-logn\]/, 'set value ' + String(bad));
    }
    // rangeIter bounds: NaN + non-number fail closed; lo > hi fails closed;
    // +-Infinity are legal unbounded ends
    for (const bad of [NaN, '0', null, undefined, {}, Symbol('b'), 3n]) {
        assert.throws(() => sl.rangeIter(bad, 5), /\[lite-logn\]/, 'rangeIter lo ' + String(bad));
        assert.throws(() => sl.rangeIter(0, bad), /\[lite-logn\]/, 'rangeIter hi ' + String(bad));
    }
    assert.throws(() => sl.rangeIter(5, 2), /\[lite-logn\]/); // lo > hi
    assert.doesNotThrow(() => [...sl.rangeIter(-Infinity, Infinity)]);
    // full pool fails closed (never a silent drop)
    const full = new SkipList(2, 1);
    full.set(1, 1); full.set(2, 2);
    assert.throws(() => full.set(3, 3), /\[lite-logn\]/);
});

// --- Treap (v0.5.0): coercion + [lite-logn] fail-closed tag ------------------

test('Treap fails closed with a [lite-logn]-tagged throw on every coercion door', () => {
    const { Treap } = LogNModule;
    // constructor: bad capacity (typeof-guarded before coercion; Symbol/BigInt-safe)
    for (const bad of [0, -1, 1.5, NaN, Infinity, '8', null, undefined, Symbol('x'), 0x100000000]) {
        assert.throws(() => new Treap(bad), /\[lite-logn\]/, 'ctor capacity ' + String(bad));
    }
    // constructor: bad seed (unsigned 32-bit integer only)
    for (const bad of [-1, 1.5, NaN, Infinity, '7', null, {}, Symbol('s'), 3n, 0x100000000]) {
        assert.throws(() => new Treap(8, bad), /\[lite-logn\]/, 'ctor seed ' + String(bad));
    }
    const tr = new Treap(8, 1);
    // non-finite / non-number key, typeof-first (no Symbol / BigInt coercion)
    for (const bad of [NaN, Infinity, -Infinity, '5', null, undefined, {}, Symbol('k'), 3n]) {
        assert.throws(() => tr.get(bad), /\[lite-logn\]/, 'get ' + String(bad));
        assert.throws(() => tr.has(bad), /\[lite-logn\]/, 'has ' + String(bad));
        assert.throws(() => tr.set(bad, 1), /\[lite-logn\]/, 'set key ' + String(bad));
        assert.throws(() => tr.delete(bad), /\[lite-logn\]/, 'delete ' + String(bad));
        assert.throws(() => tr.rank(bad), /\[lite-logn\]/, 'rank ' + String(bad));
        assert.throws(() => tr.successor(bad), /\[lite-logn\]/, 'successor ' + String(bad));
        assert.throws(() => tr.predecessor(bad), /\[lite-logn\]/, 'predecessor ' + String(bad));
        assert.throws(() => tr.split(bad), /\[lite-logn\]/, 'split ' + String(bad));
    }
    // non-finite / non-number value, typeof-first
    for (const bad of [NaN, Infinity, -Infinity, '5', null, undefined, {}, Symbol('v'), 3n]) {
        assert.throws(() => tr.set(0, bad), /\[lite-logn\]/, 'set value ' + String(bad));
    }
    // select index: non-integer fails closed (a programming error)
    for (const bad of [1.5, NaN, '0', null, undefined, {}, Symbol('i'), 3n]) {
        assert.throws(() => tr.select(bad), /\[lite-logn\]/, 'select ' + String(bad));
    }
    // rangeIter bounds: NaN + non-number fail closed; lo > hi fails closed
    for (const bad of [NaN, '0', null, undefined, {}, Symbol('b'), 3n]) {
        assert.throws(() => tr.rangeIter(bad, 5), /\[lite-logn\]/, 'rangeIter lo ' + String(bad));
        assert.throws(() => tr.rangeIter(0, bad), /\[lite-logn\]/, 'rangeIter hi ' + String(bad));
    }
    assert.throws(() => tr.rangeIter(5, 2), /\[lite-logn\]/); // lo > hi
    assert.doesNotThrow(() => [...tr.rangeIter(-Infinity, Infinity)]);
    // full pool fails closed (never a silent drop)
    const full = new Treap(2, 1);
    full.set(1, 1); full.set(2, 2);
    assert.throws(() => full.set(3, 3), /\[lite-logn\]/);
    // static merge fails closed on non-Treaps / cross-arena / overlapping ranges
    assert.throws(() => Treap.merge({}, tr), /\[lite-logn\]/);
    assert.throws(() => Treap.merge(new Treap(4), new Treap(4)), /\[lite-logn\]/); // different arenas
    const src = new Treap(16, 9);
    for (let k = 0; k < 8; k++) src.set(k, k);
    const [lo, hi] = src.split(4);
    assert.throws(() => Treap.merge(hi, lo), /\[lite-logn\]/); // hi keys not < lo keys
});

// --- Scapegoat (v0.6.0): coercion + [lite-logn] fail-closed tag --------------

test('Scapegoat fails closed with a [lite-logn]-tagged throw on every coercion door', () => {
    const { Scapegoat } = LogNModule;
    // constructor: bad capacity (typeof-guarded before coercion; Symbol/BigInt-safe)
    for (const bad of [0, -1, 1.5, NaN, Infinity, '8', null, undefined, Symbol('x'), 0x100000000]) {
        assert.throws(() => new Scapegoat(bad), /\[lite-logn\]/, 'ctor capacity ' + String(bad));
    }
    // constructor: bad alpha -- the OPEN interval (0.55, 0.75), so BOTH ends throw
    for (const bad of [0.55, 0.75, 0.5, 0.8, 0, 1, -1, NaN, Infinity, '0.6', null, {}, Symbol('a'), 3n]) {
        assert.throws(() => new Scapegoat(8, bad), /\[lite-logn\]/, 'ctor alpha ' + String(bad));
    }
    assert.doesNotThrow(() => new Scapegoat(8, 0.56));
    assert.doesNotThrow(() => new Scapegoat(8, 0.74));
    assert.doesNotThrow(() => new Scapegoat(8)); // alpha omitted -> default 2/3
    const sg = new Scapegoat(8);
    // non-finite / non-number key, typeof-first (no Symbol / BigInt coercion)
    for (const bad of [NaN, Infinity, -Infinity, '5', null, undefined, {}, Symbol('k'), 3n]) {
        assert.throws(() => sg.get(bad), /\[lite-logn\]/, 'get ' + String(bad));
        assert.throws(() => sg.has(bad), /\[lite-logn\]/, 'has ' + String(bad));
        assert.throws(() => sg.set(bad, 1), /\[lite-logn\]/, 'set key ' + String(bad));
        assert.throws(() => sg.delete(bad), /\[lite-logn\]/, 'delete ' + String(bad));
        assert.throws(() => sg.rank(bad), /\[lite-logn\]/, 'rank ' + String(bad));
        assert.throws(() => sg.successor(bad), /\[lite-logn\]/, 'successor ' + String(bad));
        assert.throws(() => sg.predecessor(bad), /\[lite-logn\]/, 'predecessor ' + String(bad));
    }
    // non-finite / non-number value, typeof-first
    for (const bad of [NaN, Infinity, -Infinity, '5', null, undefined, {}, Symbol('v'), 3n]) {
        assert.throws(() => sg.set(0, bad), /\[lite-logn\]/, 'set value ' + String(bad));
    }
    // select index: non-integer fails closed (a programming error)
    for (const bad of [1.5, NaN, '0', null, undefined, {}, Symbol('i'), 3n]) {
        assert.throws(() => sg.select(bad), /\[lite-logn\]/, 'select ' + String(bad));
    }
    // rangeIter bounds: NaN + non-number fail closed; lo > hi fails closed
    for (const bad of [NaN, '0', null, undefined, {}, Symbol('b'), 3n]) {
        assert.throws(() => sg.rangeIter(bad, 5), /\[lite-logn\]/, 'rangeIter lo ' + String(bad));
        assert.throws(() => sg.rangeIter(0, bad), /\[lite-logn\]/, 'rangeIter hi ' + String(bad));
    }
    assert.throws(() => sg.rangeIter(5, 2), /\[lite-logn\]/); // lo > hi
    assert.doesNotThrow(() => [...sg.rangeIter(-Infinity, Infinity)]);
    // full pool fails closed (never a silent drop)
    const full = new Scapegoat(2);
    full.set(1, 1); full.set(2, 2);
    assert.throws(() => full.set(3, 3), /\[lite-logn\]/);
    // there is deliberately NO split / merge on Scapegoat (the asymmetry vs Treap)
    assert.equal(typeof sg.split, 'undefined', 'Scapegoat has no split');
    assert.equal(typeof Scapegoat.merge, 'undefined', 'Scapegoat has no static merge');
});

// --- MinMaxHeap (v0.7.0): coercion + [lite-logn] fail-closed tag --------------

test('MinMaxHeap fails closed with a [lite-logn]-tagged throw on every coercion door', () => {
    const { MinMaxHeap } = LogNModule;
    // constructor: bad capacity (typeof-guarded before coercion; Symbol/BigInt-safe)
    for (const bad of [0, -1, 1.5, NaN, Infinity, '8', null, undefined, Symbol('x'), 10n, 2 ** 31]) {
        assert.throws(() => new MinMaxHeap(bad), /\[lite-logn\]/, 'ctor capacity ' + String(bad));
    }
    const h = new MinMaxHeap(8);
    // non-finite / non-number key, typeof-first (checked BEFORE the id); size unchanged
    for (const bad of [NaN, Infinity, -Infinity, '3', null, undefined, {}, Symbol('k'), 1n]) {
        assert.throws(() => h.push(0, bad), /\[lite-logn\]/, 'push key ' + String(bad));
    }
    assert.equal(h.size, 0);
    // non-integer / out-of-range id (the id domain is [0, 2^32))
    for (const bad of [-1, 1.5, NaN, Infinity, 2 ** 32, '0', null, undefined, {}, Symbol('i'), 3n]) {
        assert.throws(() => h.push(bad, 1), /\[lite-logn\]/, 'push id ' + String(bad));
    }
    assert.equal(h.size, 0);
    // full heap fails closed (never a silent drop); size unchanged
    const full = new MinMaxHeap(2);
    full.push(0, 1); full.push(1, 2);
    assert.throws(() => full.push(2, 3), /\[lite-logn\]/);
    assert.equal(full.size, 2);
    // build fails closed on bad input
    assert.throws(() => MinMaxHeap.build(null, [1], 8), /\[lite-logn\]/);
    assert.throws(() => MinMaxHeap.build([0, 1], [1], 8), /\[lite-logn\]/);      // length mismatch
    assert.throws(() => MinMaxHeap.build([0, 1], [1, NaN], 8), /\[lite-logn\]/); // non-finite key
    assert.throws(() => MinMaxHeap.build([0, -1], [1, 2], 8), /\[lite-logn\]/);  // id < 0
    // there is deliberately NO changeKey / remove on MinMaxHeap (non-addressable DEPQ)
    assert.equal(typeof h.changeKey, 'undefined', 'MinMaxHeap has no changeKey');
    assert.equal(typeof h.remove, 'undefined', 'MinMaxHeap has no remove');
});

// --- SplayTree (v0.8.0): coercion + [lite-logn] fail-closed tag ---------------

test('SplayTree fails closed with a [lite-logn]-tagged throw on every coercion door', () => {
    const { SplayTree } = LogNModule;
    // constructor: bad capacity (typeof-guarded before coercion; Symbol/BigInt-safe)
    for (const bad of [0, -1, 1.5, NaN, Infinity, '8', null, undefined, Symbol('x'), 0x100000000, 3n]) {
        assert.throws(() => new SplayTree(bad), /\[lite-logn\]/, 'ctor capacity ' + String(bad));
    }
    const sp = new SplayTree(8);
    // non-finite / non-number key, typeof-first (no Symbol / BigInt coercion)
    for (const bad of [NaN, Infinity, -Infinity, '5', null, undefined, {}, Symbol('k'), 3n]) {
        assert.throws(() => sp.get(bad), /\[lite-logn\]/, 'get ' + String(bad));
        assert.throws(() => sp.has(bad), /\[lite-logn\]/, 'has ' + String(bad));
        assert.throws(() => sp.set(bad, 1), /\[lite-logn\]/, 'set key ' + String(bad));
        assert.throws(() => sp.delete(bad), /\[lite-logn\]/, 'delete ' + String(bad));
        assert.throws(() => sp.successor(bad), /\[lite-logn\]/, 'successor ' + String(bad));
        assert.throws(() => sp.predecessor(bad), /\[lite-logn\]/, 'predecessor ' + String(bad));
    }
    // non-finite / non-number value, typeof-first
    for (const bad of [NaN, Infinity, -Infinity, '5', null, undefined, {}, Symbol('v'), 3n]) {
        assert.throws(() => sp.set(0, bad), /\[lite-logn\]/, 'set value ' + String(bad));
    }
    // a failed value door leaves the tree unchanged (size steady, no ghost node)
    assert.equal(sp.size, 0);
    // rangeIter bounds: NaN + non-number fail closed; lo > hi fails closed
    for (const bad of [NaN, '0', null, undefined, {}, Symbol('b'), 3n]) {
        assert.throws(() => sp.rangeIter(bad, 5), /\[lite-logn\]/, 'rangeIter lo ' + String(bad));
        assert.throws(() => sp.rangeIter(0, bad), /\[lite-logn\]/, 'rangeIter hi ' + String(bad));
    }
    assert.throws(() => sp.rangeIter(5, 2), /\[lite-logn\]/); // lo > hi
    assert.doesNotThrow(() => [...sp.rangeIter(-Infinity, Infinity)]);
    // full pool fails closed (never a silent drop)
    const full = new SplayTree(2);
    full.set(1, 1); full.set(2, 2);
    assert.throws(() => full.set(3, 3), /\[lite-logn\]/);
    // SplayTree is the LEAN member: deliberately NO rank / select / split / merge
    assert.equal(typeof sp.rank, 'undefined', 'SplayTree has no rank (LEAN)');
    assert.equal(typeof sp.select, 'undefined', 'SplayTree has no select (LEAN)');
    assert.equal(typeof sp.split, 'undefined', 'SplayTree has no split (LEAN)');
    assert.equal(typeof SplayTree.merge, 'undefined', 'SplayTree has no static merge (LEAN)');
});

// --- BinomialHeap (v0.9.0): coercion + [lite-logn] fail-closed tag ------------

test('BinomialHeap fails closed with a [lite-logn]-tagged throw on every coercion door', () => {
    const { BinomialHeap } = LogNModule;
    // constructor: bad capacity (typeof-guarded before coercion; Symbol/BigInt-safe)
    for (const bad of [0, -1, 1.5, NaN, Infinity, '8', null, undefined, Symbol('x'), 10n, 2 ** 31]) {
        assert.throws(() => new BinomialHeap(bad), /\[lite-logn\]/, 'ctor capacity ' + String(bad));
    }
    // constructor: bad kind (only 'min' | 'max'; default 'min' when omitted)
    for (const bad of ['biggest', 'MIN', '', null, 0, Symbol('k'), {}, 3n]) {
        assert.throws(() => new BinomialHeap(8, bad), /\[lite-logn\]/, 'ctor kind ' + String(bad));
    }
    assert.doesNotThrow(() => new BinomialHeap(8));         // kind omitted -> 'min'
    assert.equal(new BinomialHeap(8).kind, 'min');
    assert.equal(new BinomialHeap(8, 'max').kind, 'max');
    const h = new BinomialHeap(8, 'min');
    // non-finite / non-number key, typeof-first (checked BEFORE the id); size unchanged
    for (const bad of [NaN, Infinity, -Infinity, '3', null, undefined, {}, Symbol('k'), 1n]) {
        assert.throws(() => h.push(0, bad), /\[lite-logn\]/, 'push key ' + String(bad));
    }
    assert.equal(h.size, 0);
    // non-integer / out-of-range id (the id domain is [0, 2^32))
    for (const bad of [-1, 1.5, NaN, Infinity, 2 ** 32, '0', null, undefined, {}, Symbol('i'), 3n]) {
        assert.throws(() => h.push(bad, 1), /\[lite-logn\]/, 'push id ' + String(bad));
    }
    assert.equal(h.size, 0);
    // full arena fails closed (never a silent drop); size unchanged
    const full = new BinomialHeap(2, 'min');
    full.push(0, 1); full.push(1, 2);
    assert.throws(() => full.push(2, 3), /\[lite-logn\]/);
    assert.equal(full.size, 2);
    // empty peek/pop never throw (they return undefined)
    const empty = new BinomialHeap(4, 'min');
    assert.equal(empty.peekMin(), undefined);
    assert.equal(empty.peekMinKey(), undefined);
    assert.equal(empty.popMin(), undefined);

    // arena factory: bad count fails closed
    for (const bad of [0, -1, 1.5, NaN, '2', null, undefined, {}, Symbol('c'), 2n]) {
        assert.throws(() => BinomialHeap.arena(8, 'min', bad), /\[lite-logn\]/, 'arena count ' + String(bad));
    }
    // arena also validates capacity + kind through the constructor
    assert.throws(() => BinomialHeap.arena(0, 'min', 2), /\[lite-logn\]/);
    assert.throws(() => BinomialHeap.arena(8, 'bad', 2), /\[lite-logn\]/);

    // meld fails closed: non-BinomialHeap arg, self, cross-arena, kind mismatch
    assert.throws(() => h.meld({}), /\[lite-logn\]/, 'meld non-BinomialHeap');
    assert.throws(() => h.meld(h), /\[lite-logn\]/, 'meld self');
    assert.throws(() => new BinomialHeap(4, 'min').meld(new BinomialHeap(4, 'min')), /\[lite-logn\]/, 'meld cross-arena');
    const [minA, minB] = BinomialHeap.arena(8, 'min', 2);
    const [maxA] = BinomialHeap.arena(8, 'max', 1);
    assert.throws(() => minA.meld(maxA), /\[lite-logn\]/, 'meld kind mismatch (also cross-arena)');

    // meld CONSUMES the donor: it becomes empty (size 0) AND dead -- every later op fails closed,
    // so a reused donor can never silently re-enter the now-shared roots (the top-risk contract).
    for (let k = 0; k < 4; k++) minA.push(k, k);
    for (let k = 0; k < 4; k++) minB.push(k + 4, k + 4);
    minA.meld(minB);
    assert.equal(minB.size, 0, 'consumed donor is empty');
    assert.equal(minA.size, 8, 'melded heap holds every node');
    assert.throws(() => minB.push(1, 1), /\[lite-logn\]/, 'consumed donor push fails closed');
    assert.throws(() => minB.popMin(), /\[lite-logn\]/, 'consumed donor popMin fails closed');
    assert.throws(() => minB.peekMin(), /\[lite-logn\]/, 'consumed donor peekMin fails closed');
    assert.throws(() => minB.peekMinKey(), /\[lite-logn\]/, 'consumed donor peekMinKey fails closed');
    assert.throws(() => minB.clear(), /\[lite-logn\]/, 'consumed donor clear fails closed');
    assert.throws(() => minB.forEach(() => {}), /\[lite-logn\]/, 'consumed donor forEach fails closed');
    assert.throws(() => [...minB], /\[lite-logn\]/, 'consumed donor iteration fails closed');
    assert.throws(() => minA.meld(minB), /\[lite-logn\]/, 'melding a consumed operand fails closed');

    // BinomialHeap is LEAN + NON-ADDRESSABLE: deliberately NO decreaseKey / remove / changeKey /
    // rank / select (the opaque-id, no-reverse-map asymmetry vs Treap/Scapegoat and BinaryHeap).
    assert.equal(typeof h.decreaseKey, 'undefined', 'BinomialHeap has no decreaseKey (LEAN)');
    assert.equal(typeof h.remove, 'undefined', 'BinomialHeap has no remove (LEAN)');
    assert.equal(typeof h.changeKey, 'undefined', 'BinomialHeap has no changeKey (LEAN)');
    assert.equal(typeof h.rank, 'undefined', 'BinomialHeap has no rank (LEAN)');
    assert.equal(typeof h.select, 'undefined', 'BinomialHeap has no select (LEAN)');
});

// --- PairingHeap (v0.10.0): coercion + [lite-logn] fail-closed tag ------------

test('PairingHeap fails closed with a [lite-logn]-tagged throw on every coercion door', () => {
    const { PairingHeap } = LogNModule;
    // constructor: bad capacity (typeof-guarded before coercion; Symbol/BigInt-safe)
    for (const bad of [0, -1, 1.5, NaN, Infinity, '8', null, undefined, Symbol('x'), 10n, 2 ** 31]) {
        assert.throws(() => new PairingHeap(bad), /\[lite-logn\]/, 'ctor capacity ' + String(bad));
    }
    // constructor: bad kind (only 'min' | 'max'; default 'min' when omitted)
    for (const bad of ['biggest', 'MIN', '', null, 0, Symbol('k'), {}, 3n]) {
        assert.throws(() => new PairingHeap(8, bad), /\[lite-logn\]/, 'ctor kind ' + String(bad));
    }
    assert.doesNotThrow(() => new PairingHeap(8));         // kind omitted -> 'min'
    assert.equal(new PairingHeap(8).kind, 'min');
    assert.equal(new PairingHeap(8, 'max').kind, 'max');
    const h = new PairingHeap(8, 'min');
    // non-finite / non-number key, typeof-first (checked BEFORE the id); size unchanged
    for (const bad of [NaN, Infinity, -Infinity, '3', null, undefined, {}, Symbol('k'), 1n]) {
        assert.throws(() => h.push(0, bad), /\[lite-logn\]/, 'push key ' + String(bad));
    }
    assert.equal(h.size, 0);
    // non-integer / out-of-range id (the id domain is [0, capacity))
    for (const bad of [-1, 1.5, NaN, Infinity, 8, 100, '0', null, undefined, {}, Symbol('i'), 3n]) {
        assert.throws(() => h.push(bad, 1), /\[lite-logn\]/, 'push id ' + String(bad));
    }
    assert.equal(h.size, 0);
    // ADDRESSABLE, ARENA-WIDE-UNIQUE ids: a re-push of a live id throws (no silent overwrite)
    h.push(2, 5);
    assert.throws(() => h.push(2, 9), /\[lite-logn\]/, 'duplicate live id fails closed');
    assert.equal(h.size, 1);
    // full arena fails closed (never a silent drop); size unchanged
    const full = new PairingHeap(2, 'min');
    full.push(0, 1); full.push(1, 2);
    assert.throws(() => full.push(2, 3), /\[lite-logn\]/); // capacity is the id domain too (id 2 out of range)
    assert.equal(full.size, 2);
    // empty peek/pop never throw (they return undefined)
    const empty = new PairingHeap(4, 'min');
    assert.equal(empty.peekMin(), undefined);
    assert.equal(empty.peekMinKey(), undefined);
    assert.equal(empty.popMin(), undefined);

    // decreaseKey: bad key (FIRST), out-of-range id, non-member, wrong-direction all fail closed
    const dk = new PairingHeap(16, 'min');
    for (let k = 0; k < 8; k++) dk.push(k, 100 + k);
    for (const bad of [NaN, Infinity, -Infinity, '3', null, undefined, {}, Symbol('k'), 1n]) {
        assert.throws(() => dk.decreaseKey(0, bad), /\[lite-logn\]/, 'decreaseKey key ' + String(bad));
    }
    for (const bad of [-1, 1.5, NaN, 16, 100, '0', null, Symbol('i'), 3n]) {
        assert.throws(() => dk.decreaseKey(bad, 1), /\[lite-logn\]/, 'decreaseKey id ' + String(bad));
    }
    assert.throws(() => dk.decreaseKey(12, 1), /\[lite-logn\]/, 'decreaseKey non-member');    // id 12 absent
    assert.throws(() => dk.decreaseKey(3, 999), /\[lite-logn\]/, 'decreaseKey away from extreme'); // min: increase rejected
    dk.decreaseKey(3, -5); // toward-extreme OK
    assert.equal(dk.peekMin(), 3);
    assert.equal(dk.keyOf(3), -5);

    // remove: out-of-range id throws; absent id returns false; present returns true
    for (const bad of [-1, 1.5, NaN, 16, '0', null, Symbol('i'), 3n]) {
        assert.throws(() => dk.remove(bad), /\[lite-logn\]/, 'remove id ' + String(bad));
    }
    assert.equal(dk.remove(11), false, 'remove absent id -> false');
    assert.equal(dk.remove(3), true, 'remove present id -> true');
    assert.equal(dk.has(3), false);
    // has / keyOf on out-of-range throw; on absent return false / undefined
    for (const bad of [-1, 16, 1.5, NaN, Symbol('i'), 3n]) {
        assert.throws(() => dk.has(bad), /\[lite-logn\]/, 'has id ' + String(bad));
        assert.throws(() => dk.keyOf(bad), /\[lite-logn\]/, 'keyOf id ' + String(bad));
    }
    assert.equal(dk.has(11), false);
    assert.equal(dk.keyOf(11), undefined);

    // arena factory: bad count fails closed
    for (const bad of [0, -1, 1.5, NaN, '2', null, undefined, {}, Symbol('c'), 2n]) {
        assert.throws(() => PairingHeap.arena(8, 'min', bad), /\[lite-logn\]/, 'arena count ' + String(bad));
    }
    assert.throws(() => PairingHeap.arena(0, 'min', 2), /\[lite-logn\]/);
    assert.throws(() => PairingHeap.arena(8, 'bad', 2), /\[lite-logn\]/);

    // meld fails closed: non-PairingHeap arg, self, cross-arena, kind mismatch
    assert.throws(() => h.meld({}), /\[lite-logn\]/, 'meld non-PairingHeap');
    assert.throws(() => h.meld(h), /\[lite-logn\]/, 'meld self');
    assert.throws(() => new PairingHeap(4, 'min').meld(new PairingHeap(4, 'min')), /\[lite-logn\]/, 'meld cross-arena');
    const [minA, minB] = PairingHeap.arena(16, 'min', 2);
    const [maxA] = PairingHeap.arena(16, 'max', 1);
    assert.throws(() => minA.meld(maxA), /\[lite-logn\]/, 'meld kind mismatch (also cross-arena)');

    // ARENA-WIDE ids + per-heap OWNER: an id live in sibling minB cannot be pushed into minA, and
    // decreaseKey/remove on a sibling's id from minA is O(1)-detected and fails closed.
    for (let k = 0; k < 4; k++) minA.push(k, 100 - k);
    for (let k = 4; k < 8; k++) minB.push(k, 100 - k);
    assert.throws(() => minA.push(5, 1), /\[lite-logn\]/, 'arena-wide unique id (5 is minB\'s)');
    assert.throws(() => minA.decreaseKey(5, 1), /\[lite-logn\]/, 'cross-heap decreaseKey fails closed');
    assert.throws(() => minA.remove(5), /\[lite-logn\]/, 'cross-heap remove fails closed');
    assert.equal(minA.has(5), false, 'sibling id is not a member of this heap');
    assert.equal(minA.keyOf(5), undefined, 'sibling id keyOf is undefined');

    // meld CONSUMES the donor: it becomes empty (size 0) AND dead; every later op fails closed.
    minA.meld(minB);
    assert.equal(minB.size, 0, 'consumed donor is empty');
    assert.equal(minA.size, 8, 'melded heap holds every node');
    // the melded-in id 5 is NOW minA's -> decreaseKey succeeds (the addressable meld contract)
    assert.doesNotThrow(() => minA.decreaseKey(5, -1));
    assert.equal(minA.peekMin(), 5, 'melded-in id decreaseKey reaches the root');
    assert.throws(() => minB.push(1, 1), /\[lite-logn\]/, 'consumed donor push fails closed');
    assert.throws(() => minB.popMin(), /\[lite-logn\]/, 'consumed donor popMin fails closed');
    assert.throws(() => minB.peekMin(), /\[lite-logn\]/, 'consumed donor peekMin fails closed');
    assert.throws(() => minB.decreaseKey(4, 1), /\[lite-logn\]/, 'consumed donor decreaseKey fails closed');
    assert.throws(() => minB.remove(4), /\[lite-logn\]/, 'consumed donor remove fails closed');
    assert.throws(() => minB.clear(), /\[lite-logn\]/, 'consumed donor clear fails closed');
    assert.throws(() => minB.forEach(() => {}), /\[lite-logn\]/, 'consumed donor forEach fails closed');
    assert.throws(() => [...minB], /\[lite-logn\]/, 'consumed donor iteration fails closed');
    assert.throws(() => minA.meld(minB), /\[lite-logn\]/, 'melding a consumed operand fails closed');

    // PairingHeap is ADDRESSABLE but NOT an ordered map: NO changeKey / rank / select / successor.
    assert.equal(typeof h.changeKey, 'undefined', 'PairingHeap has no changeKey (use decreaseKey)');
    assert.equal(typeof h.rank, 'undefined', 'PairingHeap has no rank (not an ordered map)');
    assert.equal(typeof h.select, 'undefined', 'PairingHeap has no select (not an ordered map)');
    assert.equal(typeof h.successor, 'undefined', 'PairingHeap has no successor (not an ordered map)');
});

// --- FibonacciHeap (v0.11.0): coercion + [lite-logn] fail-closed tag ----------

test('FibonacciHeap fails closed with a [lite-logn]-tagged throw on every coercion door', () => {
    const { FibonacciHeap } = LogNModule;
    // constructor: bad capacity (typeof-guarded before coercion; Symbol/BigInt-safe)
    for (const bad of [0, -1, 1.5, NaN, Infinity, '8', null, undefined, Symbol('x'), 10n, 2 ** 31]) {
        assert.throws(() => new FibonacciHeap(bad), /\[lite-logn\]/, 'ctor capacity ' + String(bad));
    }
    // constructor: bad kind (only 'min' | 'max'; default 'min' when omitted)
    for (const bad of ['biggest', 'MIN', '', null, 0, Symbol('k'), {}, 3n]) {
        assert.throws(() => new FibonacciHeap(8, bad), /\[lite-logn\]/, 'ctor kind ' + String(bad));
    }
    assert.doesNotThrow(() => new FibonacciHeap(8));         // kind omitted -> 'min'
    assert.equal(new FibonacciHeap(8).kind, 'min');
    assert.equal(new FibonacciHeap(8, 'max').kind, 'max');
    const h = new FibonacciHeap(8, 'min');
    // non-finite / non-number key, typeof-first (checked BEFORE the id); size unchanged
    for (const bad of [NaN, Infinity, -Infinity, '3', null, undefined, {}, Symbol('k'), 1n]) {
        assert.throws(() => h.push(0, bad), /\[lite-logn\]/, 'push key ' + String(bad));
    }
    assert.equal(h.size, 0);
    // non-integer / out-of-range id (the id domain is [0, capacity))
    for (const bad of [-1, 1.5, NaN, Infinity, 8, 100, '0', null, undefined, {}, Symbol('i'), 3n]) {
        assert.throws(() => h.push(bad, 1), /\[lite-logn\]/, 'push id ' + String(bad));
    }
    assert.equal(h.size, 0);
    // ADDRESSABLE, ARENA-WIDE-UNIQUE ids: a re-push of a live id throws (no silent overwrite)
    h.push(2, 5);
    assert.throws(() => h.push(2, 9), /\[lite-logn\]/, 'duplicate live id fails closed');
    assert.equal(h.size, 1);
    // full arena fails closed (never a silent drop); size unchanged
    const full = new FibonacciHeap(2, 'min');
    full.push(0, 1); full.push(1, 2);
    assert.throws(() => full.push(2, 3), /\[lite-logn\]/); // capacity is the id domain too (id 2 out of range)
    assert.equal(full.size, 2);
    // empty peek/pop never throw (they return undefined)
    const empty = new FibonacciHeap(4, 'min');
    assert.equal(empty.peekMin(), undefined);
    assert.equal(empty.peekMinKey(), undefined);
    assert.equal(empty.popMin(), undefined);

    // decreaseKey: bad key (FIRST), out-of-range id, non-member, wrong-direction all fail closed
    const dk = new FibonacciHeap(16, 'min');
    for (let k = 0; k < 8; k++) dk.push(k, 100 + k);
    for (const bad of [NaN, Infinity, -Infinity, '3', null, undefined, {}, Symbol('k'), 1n]) {
        assert.throws(() => dk.decreaseKey(0, bad), /\[lite-logn\]/, 'decreaseKey key ' + String(bad));
    }
    for (const bad of [-1, 1.5, NaN, 16, 100, '0', null, Symbol('i'), 3n]) {
        assert.throws(() => dk.decreaseKey(bad, 1), /\[lite-logn\]/, 'decreaseKey id ' + String(bad));
    }
    assert.throws(() => dk.decreaseKey(12, 1), /\[lite-logn\]/, 'decreaseKey non-member');    // id 12 absent
    assert.throws(() => dk.decreaseKey(3, 999), /\[lite-logn\]/, 'decreaseKey away from extreme'); // min: increase rejected
    dk.decreaseKey(3, -5); // toward-extreme OK
    assert.equal(dk.peekMin(), 3);
    assert.equal(dk.keyOf(3), -5);

    // remove: out-of-range id throws; absent id returns false; present returns true
    for (const bad of [-1, 1.5, NaN, 16, '0', null, Symbol('i'), 3n]) {
        assert.throws(() => dk.remove(bad), /\[lite-logn\]/, 'remove id ' + String(bad));
    }
    assert.equal(dk.remove(11), false, 'remove absent id -> false');
    assert.equal(dk.remove(3), true, 'remove present id -> true');
    assert.equal(dk.has(3), false);
    // has / keyOf on out-of-range throw; on absent return false / undefined
    for (const bad of [-1, 16, 1.5, NaN, Symbol('i'), 3n]) {
        assert.throws(() => dk.has(bad), /\[lite-logn\]/, 'has id ' + String(bad));
        assert.throws(() => dk.keyOf(bad), /\[lite-logn\]/, 'keyOf id ' + String(bad));
    }
    assert.equal(dk.has(11), false);
    assert.equal(dk.keyOf(11), undefined);

    // arena factory: bad count fails closed
    for (const bad of [0, -1, 1.5, NaN, '2', null, undefined, {}, Symbol('c'), 2n]) {
        assert.throws(() => FibonacciHeap.arena(8, 'min', bad), /\[lite-logn\]/, 'arena count ' + String(bad));
    }
    assert.throws(() => FibonacciHeap.arena(0, 'min', 2), /\[lite-logn\]/);
    assert.throws(() => FibonacciHeap.arena(8, 'bad', 2), /\[lite-logn\]/);

    // meld fails closed: non-FibonacciHeap arg, self, cross-arena, kind mismatch
    assert.throws(() => h.meld({}), /\[lite-logn\]/, 'meld non-FibonacciHeap');
    assert.throws(() => h.meld(h), /\[lite-logn\]/, 'meld self');
    assert.throws(() => new FibonacciHeap(4, 'min').meld(new FibonacciHeap(4, 'min')), /\[lite-logn\]/, 'meld cross-arena');
    const [minA, minB] = FibonacciHeap.arena(16, 'min', 2);
    const [maxA] = FibonacciHeap.arena(16, 'max', 1);
    assert.throws(() => minA.meld(maxA), /\[lite-logn\]/, 'meld kind mismatch (also cross-arena)');

    // ARENA-WIDE ids + per-heap OWNER: an id live in sibling minB cannot be pushed into minA, and
    // decreaseKey/remove on a sibling's id from minA is O(1)-detected and fails closed.
    for (let k = 0; k < 4; k++) minA.push(k, 100 - k);
    for (let k = 4; k < 8; k++) minB.push(k, 100 - k);
    assert.throws(() => minA.push(5, 1), /\[lite-logn\]/, 'arena-wide unique id (5 is minB\'s)');
    assert.throws(() => minA.decreaseKey(5, 1), /\[lite-logn\]/, 'cross-heap decreaseKey fails closed');
    assert.throws(() => minA.remove(5), /\[lite-logn\]/, 'cross-heap remove fails closed');
    assert.equal(minA.has(5), false, 'sibling id is not a member of this heap');
    assert.equal(minA.keyOf(5), undefined, 'sibling id keyOf is undefined');

    // meld CONSUMES the donor: it becomes empty (size 0) AND dead; every later op fails closed.
    minA.meld(minB);
    assert.equal(minB.size, 0, 'consumed donor is empty');
    assert.equal(minA.size, 8, 'melded heap holds every node');
    // the melded-in id 5 is NOW minA's -> decreaseKey succeeds (the addressable meld contract)
    assert.doesNotThrow(() => minA.decreaseKey(5, -1));
    assert.equal(minA.peekMin(), 5, 'melded-in id decreaseKey reaches the extreme');
    assert.throws(() => minB.push(1, 1), /\[lite-logn\]/, 'consumed donor push fails closed');
    assert.throws(() => minB.popMin(), /\[lite-logn\]/, 'consumed donor popMin fails closed');
    assert.throws(() => minB.peekMin(), /\[lite-logn\]/, 'consumed donor peekMin fails closed');
    assert.throws(() => minB.decreaseKey(4, 1), /\[lite-logn\]/, 'consumed donor decreaseKey fails closed');
    assert.throws(() => minB.remove(4), /\[lite-logn\]/, 'consumed donor remove fails closed');
    assert.throws(() => minB.clear(), /\[lite-logn\]/, 'consumed donor clear fails closed');
    assert.throws(() => minB.forEach(() => {}), /\[lite-logn\]/, 'consumed donor forEach fails closed');
    assert.throws(() => [...minB], /\[lite-logn\]/, 'consumed donor iteration fails closed');
    assert.throws(() => minA.meld(minB), /\[lite-logn\]/, 'melding a consumed operand fails closed');

    // FibonacciHeap is ADDRESSABLE but NOT an ordered map: NO changeKey / rank / select / successor.
    assert.equal(typeof h.changeKey, 'undefined', 'FibonacciHeap has no changeKey (use decreaseKey)');
    assert.equal(typeof h.rank, 'undefined', 'FibonacciHeap has no rank (not an ordered map)');
    assert.equal(typeof h.select, 'undefined', 'FibonacciHeap has no select (not an ordered map)');
    assert.equal(typeof h.successor, 'undefined', 'FibonacciHeap has no successor (not an ordered map)');
});

// --- Fenwick2D (v0.12.0): coercion + [lite-logn] fail-closed tag --------------

test('Fenwick2D fails closed with a [lite-logn]-tagged throw on every coercion door', () => {
    const { Fenwick2D } = LogNModule;
    // constructor: bad rows / cols (typeof-guarded before coercion; Symbol/BigInt-safe)
    for (const bad of [0, -1, 1.5, NaN, Infinity, '8', null, undefined, Symbol('x'), 3n]) {
        assert.throws(() => new Fenwick2D(bad, 4), /\[lite-logn\]/, 'ctor rows ' + String(bad));
        assert.throws(() => new Fenwick2D(4, bad), /\[lite-logn\]/, 'ctor cols ' + String(bad));
    }
    // INDEX CEILING: a dim pair whose (rows+1)*(cols+1) overflows the 2^31-1 cell ceiling fails
    // CLOSED (a float multiply, never | 0 which would wrap a large product to a small int -> OPEN).
    assert.throws(() => new Fenwick2D(0x40000000, 0x40000000), /\[lite-logn\]/, 'cell-product overflow');
    assert.throws(() => new Fenwick2D(0x7FFFFFFF, 0x7FFFFFFF), /\[lite-logn\]/, 'cell-product overflow (max dims)');
    const f = new Fenwick2D(8, 8);
    // non-finite / non-number delta and value, typeof-first (no Symbol / BigInt coercion)
    for (const bad of [NaN, Infinity, -Infinity, '5', null, undefined, {}, Symbol('k'), 3n]) {
        assert.throws(() => f.update(0, 0, bad), /\[lite-logn\]/, 'update delta ' + String(bad));
        assert.throws(() => f.set(0, 0, bad), /\[lite-logn\]/, 'set value ' + String(bad));
    }
    // out-of-range coords on every coord-taking op
    for (const bad of [-1, 8, 100, 1.5, NaN, '0', null, Symbol('i')]) {
        assert.throws(() => f.update(bad, 0, 1), /\[lite-logn\]/, 'update r ' + String(bad));
        assert.throws(() => f.update(0, bad, 1), /\[lite-logn\]/, 'update c ' + String(bad));
        assert.throws(() => f.at(bad, 0), /\[lite-logn\]/, 'at r ' + String(bad));
        assert.throws(() => f.at(0, bad), /\[lite-logn\]/, 'at c ' + String(bad));
        assert.throws(() => f.set(bad, 0, 1), /\[lite-logn\]/, 'set r ' + String(bad));
        assert.throws(() => f.rectSum(bad, 0, 7, 7), /\[lite-logn\]/, 'rectSum r1 ' + String(bad));
        assert.throws(() => f.rectSum(0, bad, 7, 7), /\[lite-logn\]/, 'rectSum c1 ' + String(bad));
        assert.throws(() => f.rectSum(0, 0, bad, 7), /\[lite-logn\]/, 'rectSum r2 ' + String(bad));
        assert.throws(() => f.rectSum(0, 0, 7, bad), /\[lite-logn\]/, 'rectSum c2 ' + String(bad));
    }
    // prefix admits -1 on EACH dim (the empty-prefix base case) but rejects other sub-zero
    assert.equal(f.prefix(-1, 5), 0);
    assert.equal(f.prefix(5, -1), 0);
    assert.equal(f.prefix(-1, -1), 0);
    assert.throws(() => f.prefix(-2, 0), /\[lite-logn\]/);
    assert.throws(() => f.prefix(0, -2), /\[lite-logn\]/);
    assert.throws(() => f.prefix(8, 0), /\[lite-logn\]/);
    // rectSum r1 > r2 / c1 > c2 fail closed
    assert.throws(() => f.rectSum(5, 0, 2, 7), /\[lite-logn\]/);
    assert.throws(() => f.rectSum(0, 5, 7, 2), /\[lite-logn\]/);
    // build fails closed on non-2D-array-like / ragged rows / non-finite entry
    assert.throws(() => Fenwick2D.build(null), /\[lite-logn\]/);
    assert.throws(() => Fenwick2D.build([1, 2, 3]), /\[lite-logn\]/);          // rows not array-like
    assert.throws(() => Fenwick2D.build([[1, 2], [3]]), /\[lite-logn\]/);      // ragged rows
    assert.throws(() => Fenwick2D.build([[1, NaN], [3, 4]]), /\[lite-logn\]/); // non-finite entry
    // Fenwick2D is index-addressed SUM-ONLY: deliberately NO min/max/gcd, no changeKey/rank/select.
    assert.equal(typeof f.rank, 'undefined', 'Fenwick2D has no rank (sum-only range structure)');
    assert.equal(typeof f.select, 'undefined', 'Fenwick2D has no select (sum-only range structure)');
});

// --- SegmentTree2D (v0.13.0): coercion + [lite-logn] fail-closed tag ----------

test('SegmentTree2D fails closed with a [lite-logn]-tagged throw on every coercion door', () => {
    const { SegmentTree2D } = LogNModule;
    // constructor: bad rows / cols (typeof-guarded before coercion; Symbol/BigInt-safe)
    for (const bad of [0, -1, 1.5, NaN, Infinity, '8', null, undefined, Symbol('x'), 3n]) {
        assert.throws(() => new SegmentTree2D(bad, 4, 'sum'), /\[lite-logn\]/, 'ctor rows ' + String(bad));
        assert.throws(() => new SegmentTree2D(4, bad, 'sum'), /\[lite-logn\]/, 'ctor cols ' + String(bad));
    }
    // bad kind fails closed
    for (const bad of ['avg', '', 'MIN', null, undefined, 0, Symbol('k')]) {
        assert.throws(() => new SegmentTree2D(4, 4, bad), /\[lite-logn\]/, 'ctor kind ' + String(bad));
    }
    // INDEX CEILING: a dim pair whose 4*rows*cols overflows the 2^31-1 cell ceiling fails CLOSED
    // (a float multiply, never | 0 which would wrap a large product to a small int -> OPEN -> OOB).
    assert.throws(() => new SegmentTree2D(0x20000000, 0x20000000, 'sum'), /\[lite-logn\]/, 'cell-product overflow');
    assert.throws(() => new SegmentTree2D(0x7FFFFFFF, 0x7FFFFFFF, 'min'), /\[lite-logn\]/, 'cell-product overflow (max dims)');
    const st = new SegmentTree2D(8, 8, 'sum');
    // non-finite / non-number value, typeof-first (no Symbol / BigInt coercion)
    for (const bad of [NaN, Infinity, -Infinity, '5', null, undefined, {}, Symbol('k'), 3n]) {
        assert.throws(() => st.update(0, 0, bad), /\[lite-logn\]/, 'update value ' + String(bad));
    }
    // gcd kind additionally rejects negatives + non-integers (typeof-first still applies)
    const g = new SegmentTree2D(8, 8, 'gcd');
    for (const bad of [-1, -100, 1.5, 0.1]) {
        assert.throws(() => g.update(0, 0, bad), /\[lite-logn\]/, 'gcd update value ' + String(bad));
    }
    // out-of-range coords on every coord-taking op
    for (const bad of [-1, 8, 100, 1.5, NaN, '0', null, Symbol('i')]) {
        assert.throws(() => st.update(bad, 0, 1), /\[lite-logn\]/, 'update r ' + String(bad));
        assert.throws(() => st.update(0, bad, 1), /\[lite-logn\]/, 'update c ' + String(bad));
        assert.throws(() => st.at(bad, 0), /\[lite-logn\]/, 'at r ' + String(bad));
        assert.throws(() => st.at(0, bad), /\[lite-logn\]/, 'at c ' + String(bad));
        assert.throws(() => st.query(bad, 0, 7, 7), /\[lite-logn\]/, 'query r1 ' + String(bad));
        assert.throws(() => st.query(0, bad, 7, 7), /\[lite-logn\]/, 'query c1 ' + String(bad));
        assert.throws(() => st.query(0, 0, bad, 7), /\[lite-logn\]/, 'query r2 ' + String(bad));
        assert.throws(() => st.query(0, 0, 7, bad), /\[lite-logn\]/, 'query c2 ' + String(bad));
    }
    // query r1 > r2 / c1 > c2 fail closed
    assert.throws(() => st.query(5, 0, 2, 7), /\[lite-logn\]/);
    assert.throws(() => st.query(0, 5, 7, 2), /\[lite-logn\]/);
    // build fails closed on non-2D-array-like / ragged rows / non-finite entry / bad gcd entry
    assert.throws(() => SegmentTree2D.build(null, 'sum'), /\[lite-logn\]/);
    assert.throws(() => SegmentTree2D.build([1, 2, 3], 'sum'), /\[lite-logn\]/);          // rows not array-like
    assert.throws(() => SegmentTree2D.build([[1, 2], [3]], 'sum'), /\[lite-logn\]/);      // ragged rows
    assert.throws(() => SegmentTree2D.build([[1, NaN], [3, 4]], 'sum'), /\[lite-logn\]/); // non-finite entry
    assert.throws(() => SegmentTree2D.build([[1, -1], [3, 4]], 'gcd'), /\[lite-logn\]/);  // negative gcd entry
    // SegmentTree2D is a range FOLD structure: deliberately NO changeKey / rank / select.
    assert.equal(typeof st.rank, 'undefined', 'SegmentTree2D has no rank (range-fold structure)');
    assert.equal(typeof st.select, 'undefined', 'SegmentTree2D has no select (range-fold structure)');
});

// --- SortedArray (v0.14.0): coercion + [lite-logn] fail-closed tag ------------

test('SortedArray fails closed with a [lite-logn]-tagged throw on every coercion door', () => {
    const { SortedArray } = LogNModule;
    // constructor: bad capacity (typeof-guarded before coercion; Symbol/BigInt-safe)
    for (const bad of [0, -1, 1.5, NaN, Infinity, '8', null, undefined, {}, Symbol('x'), 3n]) {
        assert.throws(() => new SortedArray(bad), /\[lite-logn\]/, 'ctor capacity ' + String(bad));
    }
    assert.throws(() => new SortedArray(0x80000000), /\[lite-logn\]/, 'capacity above 2^31-1');
    const sa = new SortedArray(16);
    sa.set(1, 1); sa.set(2, 2);
    // non-finite / non-number key or value, typeof-first (no Symbol / BigInt coercion)
    for (const bad of [NaN, Infinity, -Infinity, '5', null, undefined, {}, Symbol('k'), 3n]) {
        assert.throws(() => sa.get(bad), /\[lite-logn\]/, 'get key ' + String(bad));
        assert.throws(() => sa.has(bad), /\[lite-logn\]/, 'has key ' + String(bad));
        assert.throws(() => sa.set(bad, 1), /\[lite-logn\]/, 'set key ' + String(bad));
        assert.throws(() => sa.set(1, bad), /\[lite-logn\]/, 'set value ' + String(bad));
        assert.throws(() => sa.delete(bad), /\[lite-logn\]/, 'delete key ' + String(bad));
        assert.throws(() => sa.rank(bad), /\[lite-logn\]/, 'rank x ' + String(bad));
        assert.throws(() => sa.successor(bad), /\[lite-logn\]/, 'successor key ' + String(bad));
        assert.throws(() => sa.predecessor(bad), /\[lite-logn\]/, 'predecessor key ' + String(bad));
    }
    // select / keyAt / valueAt reject a non-integer index (typeof-first)
    for (const bad of [1.5, NaN, Infinity, '0', null, undefined, {}, Symbol('i'), 2n]) {
        assert.throws(() => sa.select(bad), /\[lite-logn\]/, 'select ' + String(bad));
        assert.throws(() => sa.keyAt(bad), /\[lite-logn\]/, 'keyAt ' + String(bad));
        assert.throws(() => sa.valueAt(bad), /\[lite-logn\]/, 'valueAt ' + String(bad));
    }
    // rangeIter bounds: NaN / non-number fail closed, and lo > hi fails closed
    for (const bad of [NaN, '5', null, undefined, {}, Symbol('b'), 2n]) {
        assert.throws(() => sa.rangeIter(bad, 5), /\[lite-logn\]/, 'rangeIter lo ' + String(bad));
        assert.throws(() => sa.rangeIter(0, bad), /\[lite-logn\]/, 'rangeIter hi ' + String(bad));
    }
    assert.throws(() => sa.rangeIter(5, 2), /\[lite-logn\]/, 'rangeIter lo > hi');
    // set overflow fails closed
    const full = new SortedArray(2);
    full.set(1, 1); full.set(2, 2);
    assert.throws(() => full.set(3, 3), /\[lite-logn\]/, 'set past capacity');
    // build fails closed on mismatch / non-array-like / non-finite / duplicate key
    assert.throws(() => SortedArray.build(null, [1]), /\[lite-logn\]/);
    assert.throws(() => SortedArray.build([1, 2], [1]), /\[lite-logn\]/);       // length mismatch
    assert.throws(() => SortedArray.build([], []), /\[lite-logn\]/);            // empty
    assert.throws(() => SortedArray.build([1, NaN], [1, 2]), /\[lite-logn\]/);  // non-finite key
    assert.throws(() => SortedArray.build([1, 2], [1, Infinity]), /\[lite-logn\]/); // non-finite value
    assert.throws(() => SortedArray.build([5, 5], [1, 2]), /\[lite-logn\]/);    // duplicate key
    // SortedArray is an ordered MAP: it deliberately has NO changeKey (not an addressable heap).
    assert.equal(typeof sa.changeKey, 'undefined', 'SortedArray has no changeKey (ordered map, not a heap)');
});
