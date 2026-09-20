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

test('VERSION is exactly 0.6.0 at the Scapegoat release', () => {
    assert.equal(VERSION, '0.6.0');
});

// --- frozen export surface: VERSION + the shipped members (6 members) --------

test('LogN.js exports exactly VERSION, BinaryHeap, Fenwick, SegmentTree, SkipList, Treap and Scapegoat at v0.6.0 (6 members)', () => {
    const exportedNames = Object.keys(LogNModule).sort();
    assert.deepEqual(exportedNames, ['BinaryHeap', 'Fenwick', 'Scapegoat', 'SegmentTree', 'SkipList', 'Treap', 'VERSION'],
        'LogN.js export surface drifted from the frozen surface (VERSION + BinaryHeap + Fenwick + SegmentTree + SkipList + Treap + Scapegoat)');
    assert.equal(typeof VERSION, 'string');
    assert.equal(typeof LogNModule.BinaryHeap, 'function');
    assert.equal(typeof LogNModule.Fenwick, 'function');
    assert.equal(typeof LogNModule.SegmentTree, 'function');
    assert.equal(typeof LogNModule.SkipList, 'function');
    assert.equal(typeof LogNModule.Treap, 'function');
    assert.equal(typeof LogNModule.Scapegoat, 'function');
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
