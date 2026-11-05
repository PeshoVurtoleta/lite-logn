/**
 * @zakkster/lite-logn -- `_lcgNext` parity + bytecode-length gate (Smi fix, 1.5.2 candidate).
 *
 * `_lcgNext` was rewritten from `(Math.imul(s, 1664525) + 1013904223) | 0` to
 * `(_imul(s, LCG_A) + LCG_C) | 0` over module consts, so its body fits every V8
 * always-inline limit. Two properties are pinned here (DETERMINISTIC tier):
 *   - PARITY: the 32-bit output sequence is unchanged. `_lcgNext` is not exported, so it
 *     is read through observable state -- Treap `_seed` / `_prio[_root]`, SkipList `_seed`
 *     / `_level`, EulerTourTree `_prio` -- against an INDEPENDENT reference LCG written
 *     here (`(Math.imul(s, 1664525) + 1013904223) | 0`), >= 1e5 steps per seed. A mutated
 *     reference (increment + 2) is a must-fail control: it must diverge at step 0.
 *   - LENGTH: the `_lcgNext` bytecode is <= 27 bytes (Maglev small; TurboFan small is
 *     <= 30), read from a spawned `--print-bytecode --print-bytecode-filter=_lcgNext`
 *     run. The exact length is a property of one V8, so it is pinned to node v26.8.2
 *     and skips with a reason elsewhere. The 9eb484c build (36 bytes) fails it.
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { Treap, SkipList, EulerTourTree } from '../LogN.js';

const LIB = fileURLToPath(new URL('../LogN.js', import.meta.url));
const STEPS = 100000;
const SEEDS = [0, 1, 1234, 0x7FFFFFFF, 0x80000000, 0x9E3779B9, 0xFFFFFFFF];
const PINNED_NODE = 'v26.8.2';
const MAX_LEN = 27;

// The reference: the TRUE Numerical-Recipes step, written independently of LogN.js.
function refSeq(seed, n, c) {
    const out = new Int32Array(n);
    let s = seed | 0;
    for (let i = 0; i < n; i++) { s = (Math.imul(s, 1664525) + c) | 0; out[i] = s; }
    return out;
}
const C = 1013904223;

// First index where a and b differ, or -1.
function firstDiff(a, b) {
    if (a.length !== b.length) return 0;
    for (let i = 0; i < a.length; i++) if (a[i] !== b[i]) return i;
    return -1;
}

// One set per step on an otherwise-empty treap: the lone node is the root, so its
// priority is exactly the step's output (stored unsigned in the Uint32 column).
function treapObserved(seed, n) {
    const tr = new Treap(16, seed);
    const st = new Float64Array(n), pr = new Uint32Array(n);
    for (let i = 0; i < n; i++) {
        tr.set(0, i);
        st[i] = tr._seed;
        pr[i] = tr._prio[tr._root];
        tr.delete(0);
    }
    return { st, pr };
}

// One set per step on an otherwise-empty list: the live height IS the new node's level.
function skipObserved(seed, n) {
    const sl = new SkipList(1 << 16, seed);
    const st = new Float64Array(n), lv = new Uint8Array(n);
    for (let i = 0; i < n; i++) {
        sl.set(0, 0);
        st[i] = sl._seed;
        lv[i] = sl._level;
        sl.delete(0);
    }
    return { st, lv, maxLevel: sl._maxLevel };
}

test('parity: Treap _seed / _prio replay the reference LCG over 1e5 steps for every seed', () => {
    for (const seed of SEEDS) {
        const ref = refSeq(seed, STEPS, C);
        const { st, pr } = treapObserved(seed, STEPS);
        assert.equal(firstDiff(st, ref), -1, `Treap seed ${seed}: _seed diverges`);
        const refU = new Uint32Array(ref.buffer);
        assert.equal(firstDiff(pr, refU), -1, `Treap seed ${seed}: _prio diverges`);
    }
});

test('parity: SkipList _seed / level replay the reference LCG over 1e5 steps for every seed', () => {
    for (const seed of SEEDS) {
        const ref = refSeq(seed, STEPS, C);
        const { st, lv, maxLevel } = skipObserved(seed, STEPS);
        assert.equal(firstDiff(st, ref), -1, `SkipList seed ${seed}: _seed diverges`);
        const want = new Uint8Array(STEPS);
        for (let i = 0; i < STEPS; i++) { const h = 1 + Math.clz32(ref[i]); want[i] = h > maxLevel ? maxLevel : h; }
        assert.equal(firstDiff(lv, want), -1, `SkipList seed ${seed}: level diverges`);
    }
});

test('parity: EulerTourTree vertex priorities replay the reference LCG from the default seed', () => {
    const N = 4096;
    const ett = new EulerTourTree(N, 'sum');
    const ref = refSeq(0x9E3779B9, N, C);
    const got = new Uint32Array(N);
    for (let i = 0; i < N; i++) got[i] = ett._prio[i + 1];
    assert.equal(firstDiff(got, new Uint32Array(ref.buffer)), -1, 'ETT _prio diverges');
    assert.equal(ett._seed, ref[N - 1], 'ETT live seed = the last step');
});

test('control: a mutated reference (increment + 2) diverges at step 0 on both structures', () => {
    for (const seed of SEEDS) {
        const bad = refSeq(seed, 64, C + 2);
        assert.equal(firstDiff(treapObserved(seed, 64).st, bad), 0, `Treap seed ${seed}: control did not bite`);
        assert.equal(firstDiff(skipObserved(seed, 64).st, bad), 0, `SkipList seed ${seed}: control did not bite`);
    }
});

// Spawn a tiny driver that calls _lcgNext once (Treap.set) and read its bytecode length.
function lcgLengths(lib) {
    const code = 'const { Treap } = await import(' + JSON.stringify(pathToFileURL(lib).href) + ');' +
        ' new Treap(4, 1).set(1, 1);';
    const r = spawnSync(process.execPath,
        ['--print-bytecode', '--print-bytecode-filter=_lcgNext', '--input-type=module', '-e', code],
        { encoding: 'utf8', timeout: 60000, killSignal: 'SIGKILL' });
    assert.equal(r.status, 0, 'driver failed: ' + r.stderr);
    const heads = r.stdout.match(/^\[generated bytecode for function: _lcgNext /gm) || [];
    const lens = [...r.stdout.matchAll(/^Bytecode length: (\d+)$/gm)].map((m) => Number(m[1]));
    assert.equal(heads.length, 1, 'exactly one _lcgNext compile expected, saw ' + heads.length);
    assert.equal(lens.length, 1, 'exactly one length line expected, saw ' + lens.length);
    return lens[0];
}

test('bytecode: _lcgNext is <= 27 bytes (inside TurboFan small <= 30 and Maglev small <= 27)',
    { skip: process.version !== PINNED_NODE ? 'length pinned for node ' + PINNED_NODE + ' only, this is ' + process.version : false },
    () => {
        const len = lcgLengths(LIB);
        assert.ok(len <= MAX_LEN, `_lcgNext bytecode length ${len} > ${MAX_LEN}`);
    });
