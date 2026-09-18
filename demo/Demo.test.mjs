// @zakkster/lite-logn -- demo assertions (repo-only; NOT part of `npm test`).
//
//   npm run demo                                  (node --expose-gc --test demo/Demo.test.mjs)
//   node --expose-gc --test demo/Demo.test.mjs
//
// Dev-only: demo/ never ships. Proves the demo cannot lie -- every panel is drawn
// STRICTLY from the live internal-field snapshot (no shadow state), the engine step
// is zero-alloc, build/run/reset leaks nothing, the op-stream is deterministic, the
// shipped LogN.js is byte-identical, and the snapshot's coupling to LogN.js private
// fields is PINNED so a future rename fails here loudly.

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

import { BinaryHeap, Fenwick, SegmentTree, SkipList } from '../LogN.js';
import {
    createEngine, resetEngine, step, runSteps, snapshot, frameModel, digestEngine,
    MEMBER_NAMES, WORKLOADS, SNAP_F, THROW,
} from './Visualize.mjs';
import { RENDERERS, RENDERED_MEMBERS, BASE_FIELDS } from './renderers.mjs';
import {
    handle, serveWitness, serveStream, computeWitnessRow, safePath,
} from './serve.mjs';

const DEMO_DIR = dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = dirname(DEMO_DIR);

/* ------------------------------------------------------------------ setup - */

test('every engine member has a renderer (no member silently unrendered)', () => {
    assert.deepEqual([...MEMBER_NAMES].sort(), [...RENDERED_MEMBERS].sort());
    assert.equal(MEMBER_NAMES.length, 4);
});

/* -------- assertion 3: model(snap) deep-equals the live snapshot, teeth ---- */

test('assertion 3: every renderer model(snap) deep-equals the LIVE snapshot (0 shadow fields)', () => {
    const engine = createEngine({ cap: 256, n: 31, seed: 7, workload: 'mixed' });
    const checkpoints = new Set([1, 200, 1200, 2500]);
    let n = 0;
    while (n < 2500) {
        step(engine); n++;
        if (checkpoints.has(n)) {
            const frame = frameModel(engine);
            for (let i = 0; i < MEMBER_NAMES.length; i++) {
                const name = MEMBER_NAMES[i];
                const snap = frame.members[name];
                const model = RENDERERS[name].model(snap);
                assert.deepStrictEqual(model, snap, name + ' model must equal its own snapshot at step ' + n);
            }
        }
    }
    assert.ok(n >= 2000, 'exercised >= 2000 steps, got ' + n);
});

test('assertion 3 (teeth): dropping OR inventing ANY declared field fails the deep-equal, all 4 members', () => {
    const engine = createEngine({ cap: 128, n: 15, seed: 3, workload: 'churn' });
    runSteps(engine, 400);
    const frame = frameModel(engine);
    let mutationsThatBit = 0;
    for (let i = 0; i < MEMBER_NAMES.length; i++) {
        const name = MEMBER_NAMES[i];
        const snap = frame.members[name];
        const renderer = RENDERERS[name];
        const good = renderer.model(snap);
        assert.deepStrictEqual(good, snap, name + ' baseline model should match before mutation');

        // (a) drop each member-specific field -> silently unrendered.
        for (let j = 0; j < renderer.fields.length; j++) {
            const broken = { ...good };
            delete broken[renderer.fields[j]];
            assert.notDeepStrictEqual(broken, snap, name + ': dropping "' + renderer.fields[j] + '" must bite');
            mutationsThatBit++;
        }
        // (b) drop a base field.
        const brokenBase = { ...good };
        delete brokenBase[BASE_FIELDS[0]];
        assert.notDeepStrictEqual(brokenBase, snap, name + ': dropping base "' + BASE_FIELDS[0] + '" must bite');
        mutationsThatBit++;
        // (c) invent a field the snapshot never carried.
        const invented = { ...good, __shadow: 'nope' };
        assert.notDeepStrictEqual(invented, snap, name + ': inventing a field must bite');
        mutationsThatBit++;
        // (d) corrupt a numeric cell (a wrong render would draw stale structure).
        const corrupt = { ...good };
        corrupt.n = (corrupt.n | 0) + 1;
        assert.notDeepStrictEqual(corrupt, snap, name + ': a corrupted count must bite');
        mutationsThatBit++;
    }
    assert.ok(mutationsThatBit >= 16, 'at least 4 mutations per member bit, got ' + mutationsThatBit);
});

test('assertion 3 (four teeth): one corrupted-snapshot mutation per member fails the model check', () => {
    const engine = createEngine({ cap: 64, n: 15, seed: 11, workload: 'random' });
    runSteps(engine, 300);
    const frame = frameModel(engine);
    // A distinct corruption per member (a field the renderer must reproduce).
    const corrupt = {
        BinaryHeap: (s) => { const c = { ...RENDERERS.BinaryHeap.model(s) }; c.pathLen = c.pathLen + 1; return c; },
        Fenwick: (s) => { const c = { ...RENDERERS.Fenwick.model(s) }; c.target = c.target + 1; return c; },
        SegmentTree: (s) => { const c = { ...RENDERERS.SegmentTree.model(s) }; c.kind = (c.kind + 1) & 3; return c; },
        SkipList: (s) => { const c = { ...RENDERERS.SkipList.model(s) }; c.level = c.level + 1; return c; },
    };
    for (let i = 0; i < MEMBER_NAMES.length; i++) {
        const name = MEMBER_NAMES[i];
        const snap = frame.members[name];
        assert.notDeepStrictEqual(corrupt[name](snap), snap, name + ': a corrupted snapshot must fail the model check');
    }
});

/* -------- assertion 4: determinism ---------------------------------------- */

test('assertion 4: same seed -> identical op-stream -> identical frame digest + snapshots over many steps', () => {
    const spec = { cap: 256, n: 31, seed: 0x1234, workload: 'mixed' };
    const a = createEngine(spec);
    const b = createEngine({ ...spec });
    const checkpoints = new Set([1, 37, 500, 2000, 5000]);
    for (let n = 1; n <= 5000; n++) {
        step(a); step(b);
        if (checkpoints.has(n)) {
            assert.equal(digestEngine(a), digestEngine(b), 'digests diverged at step ' + n);
            const fa = frameModel(a), fb = frameModel(b);
            for (let i = 0; i < MEMBER_NAMES.length; i++) {
                const name = MEMBER_NAMES[i];
                assert.deepStrictEqual(fa.members[name], fb.members[name], name + ' snapshot diverged at step ' + n);
            }
        }
    }
    // Teeth: a DIFFERENT seed must diverge (the digest is not a constant).
    const c = createEngine({ ...spec, seed: 0x1234 ^ 0x55 });
    runSteps(a, 0); // a is at 5000
    const aDup = createEngine(spec); runSteps(aDup, 5000);
    runSteps(c, 5000);
    assert.notEqual(digestEngine(aDup), digestEngine(c), 'a different seed must produce a different digest');
});

test('assertion 4b: all three workloads are internally deterministic', () => {
    for (const workload of WORKLOADS) {
        const a = createEngine({ cap: 128, n: 15, seed: 99, workload });
        const b = createEngine({ cap: 128, n: 15, seed: 99, workload });
        runSteps(a, 1500); runSteps(b, 1500);
        assert.equal(digestEngine(a), digestEngine(b), workload + ' must be deterministic');
    }
});

/* -------- assertion 1: engine.step() is zero-alloc, gc major 0 ------------- */

test('assertion 1: engine.step() allocates 0 B/op over >= 200000 steps and drives no major GC', async () => {
    const gcp = await import('@zakkster/lite-gc-profiler').catch(() => null);
    if (gcp === null) { assert.ok(true, '(install @zakkster/lite-gc-profiler for the alloc gate)'); return; }
    const { GcProfiler, checkNoGc, measureAllocs } = gcp;

    const engine = createEngine({ cap: 1024, n: 63, seed: 0xBEEF, workload: 'mixed' });
    runSteps(engine, 10000); // warm

    // 0 B/op on step().
    const stepOnce = () => { step(engine); };
    const r = measureAllocs(stepOnce, { iterations: 100000, batches: 8 });
    const bytes = r.bytesPerCall === null ? 0 : Math.max(0, Math.round(r.bytesPerCall));
    assert.equal(bytes, 0, 'engine.step() must be 0 B/op, measured ' + bytes);

    // The STRUCTURAL frame path -- snapshot() refilling every member's preallocated
    // snapshot IN PLACE -- must ALSO be 0 B/op. This is the reusable-buffer discipline
    // the draw() geom literal violated in the browser; the HTML render loop has no DOM
    // to gate in node, but this covers the same CLASS module-side (a snapshot that
    // started allocating -- a stray literal / array / spread -- bites HERE).
    const frameStruct = () => {
        for (let i = 0; i < MEMBER_NAMES.length; i++) snapshot(engine, MEMBER_NAMES[i]);
    };
    const fr = measureAllocs(frameStruct, { iterations: 20000, batches: 8 });
    const fbytes = fr.bytesPerCall === null ? 0 : Math.max(0, Math.round(fr.bytesPerCall));
    assert.equal(fbytes, 0, 'the structural frame (all-member snapshot refill) must be 0 B/op, measured ' + fbytes);

    // Teeth: a deliberately-allocating control lane MUST read > 0, or the meter is blind.
    const sink = [];
    const ctrl = () => { sink.push({ v: engine.index & 0xffff }); };
    const cr = measureAllocs(ctrl, { iterations: 50000, batches: 8 });
    const ctrlBytes = cr.bytesPerCall === null ? 0 : Math.max(0, Math.round(cr.bytesPerCall));
    assert.ok(ctrlBytes > 0, 'the control lane must allocate (instrument teeth); read ' + ctrlBytes);
    assert.ok(sink.length > 0);

    // gc major 0 over >= 200000 steps.
    if (typeof globalThis.gc !== 'function') { assert.ok(true, '(run with --expose-gc for the major-GC gate)'); return; }
    const gc = new GcProfiler().start();
    let acc = 0;
    for (let i = 0; i < 200000; i++) {
        step(engine);
        acc = (acc + engine.index) | 0;
        if ((i & 8191) === 0) gc.sampleHeap(performance.now(), process.memoryUsage().heapUsed);
    }
    await new Promise((res) => setTimeout(res, 50));
    const s = gc.summary();
    const report = checkNoGc(s, { maxMajor: 0, maxPauseMs: 4 });
    gc.stop();
    assert.equal(acc === 0x7fffffff, false); // keep acc live
    assert.ok(report.ok, 'gc gate failed: major=' + s.gc.major + ' minor=' + s.gc.minor + ' maxMs=' + s.gc.maxMs.toFixed(2));
    assert.equal(s.gc.major, 0, 'step() must drive 0 major GC, saw ' + s.gc.major);
});

/* -------- assertion 2: build/run/reset leaks nothing ---------------------- */

test('assertion 2: >= 50 build/run/reset cycles reuse instances and leak no heap', () => {
    // Reuse ONE engine across cycles: instances + snapshot arrays are constructed
    // once and reset in place -- no per-cycle construction, no growth.
    const engine = createEngine({ cap: 512, n: 31, seed: 5, workload: 'churn' });
    const refs = {};
    const bytes = {};
    for (let i = 0; i < MEMBER_NAMES.length; i++) {
        const name = MEMBER_NAMES[i];
        refs[name] = engine.members[name];
    }
    bytes.heapKey = engine.members.BinaryHeap._key.buffer.byteLength;
    bytes.slNext = engine.members.SkipList._next.buffer.byteLength;

    let heapBefore = 0, abBefore = 0;
    if (typeof globalThis.gc === 'function') {
        globalThis.gc();
        const mu0 = process.memoryUsage();
        heapBefore = mu0.heapUsed;
        // QA: heapUsed alone is blind to leaked TypedArray backing stores -- Node
        // allocates ArrayBuffer bytes as "external"/arrayBuffers memory, OUTSIDE
        // the V8 heap. Since this engine's entire live state is TypedArray-backed
        // (Float64Array/Uint32Array/Int32Array), a real leak here (e.g. snapshot()
        // or a member accidentally allocating a fresh backing array instead of
        // reusing one) would grow arrayBuffers while heapUsed stayed flat and this
        // gate would false-PASS. Track it too. (Proven non-vacuous: injecting a
        // per-cycle retained Float64Array(200000) push left heapUsed +~0.1 MB
        // [under the 2 MB floor, a false PASS] while arrayBuffers grew ~102 MB.)
        abBefore = mu0.arrayBuffers;
    }

    for (let c = 0; c < 64; c++) {
        resetEngine(engine);
        runSteps(engine, 500);
        // conservation invariant of the SkipList free-list must hold after every cycle.
        const pool = engine.members.SkipList._pool;
        assert.equal(pool.activeSlots + pool.freeListLength, pool.capacity, 'SkipList pool conservation broke at cycle ' + c);
    }

    for (let i = 0; i < MEMBER_NAMES.length; i++) {
        const name = MEMBER_NAMES[i];
        assert.equal(engine.members[name], refs[name], name + ' instance was replaced (must be reused)');
    }
    assert.equal(engine.members.BinaryHeap._key.buffer.byteLength, bytes.heapKey, 'heap backing grew');
    assert.equal(engine.members.SkipList._next.buffer.byteLength, bytes.slNext, 'skiplist link column grew');

    if (typeof globalThis.gc === 'function') {
        globalThis.gc();
        const mu1 = process.memoryUsage();
        const grown = mu1.heapUsed - heapBefore;
        assert.ok(grown < 2 * 1024 * 1024, '64 build/run/reset cycles grew heap ' + grown + ' B (retention?)');
        const abGrown = mu1.arrayBuffers - abBefore;
        assert.ok(abGrown < 2 * 1024 * 1024,
            '64 build/run/reset cycles grew ArrayBuffer-backed (external) memory ' + abGrown +
            ' B (a TypedArray-backing leak heapUsed alone would miss)');
    }
});

test('assertion 2b: a fresh engine per cycle drops out of scope cleanly (no retained growth)', () => {
    let heapBefore = 0, abBefore = 0;
    if (typeof globalThis.gc === 'function') {
        globalThis.gc();
        const mu0 = process.memoryUsage();
        heapBefore = mu0.heapUsed;
        abBefore = mu0.arrayBuffers; // see the arrayBuffers note in assertion 2 above
    }
    for (let c = 0; c < 60; c++) {
        const engine = createEngine({ cap: 256, n: 31, seed: c + 1, workload: 'mixed' });
        runSteps(engine, 400);
        frameModel(engine);
        // engine falls out of scope here -- nothing outside holds it.
    }
    if (typeof globalThis.gc === 'function') {
        globalThis.gc();
        const mu1 = process.memoryUsage();
        const grown = mu1.heapUsed - heapBefore;
        assert.ok(grown < 4 * 1024 * 1024, '60 fresh engines grew heap ' + grown + ' B (leak?)');
        const abGrown = mu1.arrayBuffers - abBefore;
        assert.ok(abGrown < 4 * 1024 * 1024, '60 fresh engines grew ArrayBuffer-backed memory ' + abGrown + ' B (leak?)');
    } else {
        assert.ok(true, '(run with --expose-gc for the heap-bound check)');
    }
});

/* -------- assertion 6: LAYOUT-DRIFT guard (pins the read internals) -------- */

test('assertion 6: snapshot internal-field coupling is PINNED (a LogN.js rename fails here)', () => {
    // The exact underscore-prefixed fields Visualize.snapshot reads. If a future
    // LogN.js refactor renames/moves any of these, this test fails LOUDLY -- the
    // safety net for the read-internals design decision.
    const bh = new BinaryHeap(8, 'min');
    bh.push(0, 5); bh.push(1, 3);
    assert.ok(bh._key instanceof Float64Array, 'BinaryHeap._key must be a Float64Array');
    assert.ok(bh._id instanceof Uint32Array, 'BinaryHeap._id must be a Uint32Array');
    assert.ok(bh._pos instanceof Int32Array, 'BinaryHeap._pos must be an Int32Array');
    assert.equal(typeof bh._n, 'number', 'BinaryHeap._n must be a number');
    assert.equal(typeof bh._min, 'boolean', 'BinaryHeap._min must be a boolean');
    assert.equal(typeof bh._cap, 'number', 'BinaryHeap._cap must be a number');

    const fen = new Fenwick(8);
    assert.ok(fen._t instanceof Float64Array, 'Fenwick._t must be a Float64Array');
    assert.equal(typeof fen._n, 'number', 'Fenwick._n must be a number');
    assert.equal(fen._t.length, fen._n + 1, 'Fenwick._t must be length n+1 (1-based)');

    const seg = new SegmentTree(8, 'sum');
    assert.ok(seg._t instanceof Float64Array, 'SegmentTree._t must be a Float64Array');
    assert.equal(typeof seg._n, 'number', 'SegmentTree._n must be a number');
    assert.equal(typeof seg._k, 'number', 'SegmentTree._k must be a number (fold code)');
    assert.equal(seg._t.length, 2 * seg._n, 'SegmentTree._t must be length 2n');

    const sl = new SkipList(8, 1);
    sl.set(1, 1); sl.set(2, 2);
    assert.ok(sl._next instanceof Uint32Array, 'SkipList._next must be a Uint32Array');
    assert.ok(sl._key instanceof Float64Array, 'SkipList._key must be a Float64Array');
    assert.ok(sl._val instanceof Float64Array, 'SkipList._val must be a Float64Array');
    assert.equal(typeof sl._level, 'number', 'SkipList._level must be a number');
    assert.equal(typeof sl._stride, 'number', 'SkipList._stride must be a number');
    assert.equal(typeof sl._size, 'number', 'SkipList._size must be a number');
    assert.equal(typeof sl._maxLevel, 'number', 'SkipList._maxLevel must be a number');
    assert.equal(typeof sl._cap, 'number', 'SkipList._cap must be a number');
    assert.equal(typeof sl._pool.activeSlots, 'number', 'SkipList._pool.activeSlots must be a number');
    assert.equal(typeof sl._pool.freeListLength, 'number', 'SkipList._pool.freeListLength must be a number');
    assert.equal(typeof sl._pool.capacity, 'number', 'SkipList._pool.capacity must be a number');

    // And the snapshot actually consumes them (a smoke read that would throw if a
    // field vanished): every snapshot carries the format tag + a live count.
    const engine = createEngine({ cap: 16, n: 7, seed: 2, workload: 'mixed' });
    runSteps(engine, 50);
    for (const name of MEMBER_NAMES) {
        const s = snapshot(engine, name);
        assert.equal(s.f, SNAP_F, name + ' snapshot must carry the format tag');
        assert.equal(s.m, name, name + ' snapshot must carry its member name');
        assert.equal(typeof s.n, 'number');
    }
});

/* -------- structural fidelity smokes (each panel reflects the member) ------ */

test('snapshot fidelity: BinaryHeap slots satisfy the heap order the tree draws', () => {
    const engine = createEngine({ cap: 64, n: 31, seed: 8, workload: 'random' });
    runSteps(engine, 400);
    const s = snapshot(engine, 'BinaryHeap');
    for (let i = 1; i < s.n; i++) {
        const parent = (i - 1) >> 1;
        // min-heap: parent key <= child key.
        assert.ok(s.key[parent] <= s.key[i], 'heap order violated at slot ' + i + ' (min-heap invariant)');
    }
    // The lit path is a genuine root->slot ancestor chain (each next is the parent).
    for (let i = 1; i < s.pathLen; i++) {
        assert.equal(s.path[i], (s.path[i - 1] - 1) >> 1, 'path must be an ancestor chain');
    }
});

test('snapshot fidelity: SkipList level-0 order is ascending and pool conserves', () => {
    const engine = createEngine({ cap: 64, n: 31, seed: 4, workload: 'churn' });
    runSteps(engine, 500);
    const s = snapshot(engine, 'SkipList');
    for (let i = 1; i < s.n; i++) {
        assert.ok(s.key[i - 1] < s.key[i], 'skiplist level-0 order must be strictly ascending');
        assert.ok(s.height[i] >= 1, 'every node has tower height >= 1');
    }
    assert.equal(s.activeSlots + s.freeListLength, engine.members.SkipList._pool.capacity, 'pool must conserve');
});

/* -------- semantic-fidelity cross-checks: snapshot vs PUBLIC surface -------
 * The self-consistency smokes above only prove a snapshot is internally
 * coherent -- a snapshot that MISREADS the layout (e.g. an off-by-one on the
 * Fenwick BIT walk, or copying the wrong _t slice) could still be internally
 * consistent AND pass model(snap)==snap (both derived from the same wrong
 * read). These checks cross the snapshot against the SHIPPED PUBLIC API
 * (peek/topKey/prefix/at/forEach), which is independent of Visualize.snapshot,
 * so a misread that "looks right" internally still gets caught here. */

test('semantic fidelity: BinaryHeap snapshot root == the live peek()/topKey()', () => {
    const engine = createEngine({ cap: 64, n: 31, seed: 13, workload: 'mixed' });
    runSteps(engine, 600);
    const bh = engine.members.BinaryHeap;
    const s = snapshot(engine, 'BinaryHeap');
    assert.equal(s.id[0], bh.peek(), 'snapshot root id must equal the live peek()');
    assert.equal(s.key[0], bh.topKey(), 'snapshot root key must equal the live topKey()');
});

test('semantic fidelity: Fenwick snapshot _t reconstructs the SAME prefix sums as the live prefix()', () => {
    const engine = createEngine({ cap: 64, n: 31, seed: 17, workload: 'mixed' });
    runSteps(engine, 600);
    const fen = engine.members.Fenwick;
    const s = snapshot(engine, 'Fenwick');
    // Reconstruct prefix(i) from the SNAPSHOT's _t copy via the canonical BIT
    // walk (independent of Visualize.snapshot's own bookkeeping), then compare
    // against the live public prefix() -- not against another demo-derived value.
    const prefixFromSnap = (i) => {
        let sum = 0;
        for (let k = i + 1; k > 0; k -= k & -k) sum += s.t[k];
        return sum;
    };
    for (let i = 0; i < s.n; i += 3) {
        assert.equal(prefixFromSnap(i), fen.prefix(i),
            'snapshot-reconstructed prefix(' + i + ') must equal the live Fenwick.prefix()');
    }
    assert.equal(prefixFromSnap(s.n - 1), fen.prefix(s.n - 1), 'full-range prefix must match');
});

test('semantic fidelity: SegmentTree snapshot leaves == the live at(i) for every index', () => {
    const engine = createEngine({ cap: 64, n: 31, seed: 19, workload: 'mixed' });
    runSteps(engine, 600);
    const seg = engine.members.SegmentTree;
    const s = snapshot(engine, 'SegmentTree');
    for (let i = 0; i < s.n; i++) {
        assert.equal(s.t[s.n + i], seg.at(i), 'snapshot leaf ' + i + ' must equal the live SegmentTree.at()');
    }
});

test('semantic fidelity: SkipList snapshot ordered keys == the live forEach() order', () => {
    const engine = createEngine({ cap: 64, n: 31, seed: 23, workload: 'churn' });
    runSteps(engine, 600);
    const sl = engine.members.SkipList;
    const s = snapshot(engine, 'SkipList');
    const forEachKeys = [];
    sl.forEach((k) => forEachKeys.push(k));
    assert.equal(forEachKeys.length, s.n, 'snapshot count must equal the live forEach() visit count');
    for (let i = 0; i < forEachKeys.length; i++) {
        assert.equal(s.key[i], forEachKeys[i], 'snapshot order[' + i + '] must equal the live forEach() order');
    }
    // Pool conservation is a public-surface-adjacent invariant (SkipList's own
    // free-list bookkeeping, not a demo-derived number): re-derive it from the
    // live member, not from the snapshot's own copy of the same two fields.
    assert.equal(sl._pool.activeSlots + sl._pool.freeListLength, sl._pool.capacity,
        'live SkipList pool must conserve (activeSlots + freeListLength === capacity)');
});

/* -------- assertion 5: LogN.js byte-identical + no demo/ in the pack ------- */

test('assertion 5a: git diff of LogN.js is empty (the shipped source is byte-identical)', () => {
    let out;
    try {
        out = execFileSync('git', ['diff', '--stat', '--', 'LogN.js'], { cwd: REPO_ROOT, encoding: 'utf8' });
    } catch (err) {
        assert.ok(true, '(git unavailable in this environment: ' + String(err && err.message) + ')');
        return;
    }
    assert.equal(out.trim(), '', 'LogN.js must be byte-identical (git diff must be empty), got:\n' + out);
});

test('assertion 5b: npm pack lists exactly the 6 files[] + package.json, with ZERO demo/ entries', () => {
    let json;
    try {
        const out = execFileSync('npm', ['pack', '--dry-run', '--json'], { cwd: REPO_ROOT, encoding: 'utf8' });
        json = JSON.parse(out);
    } catch (err) {
        assert.ok(true, '(npm pack unavailable in this environment: ' + String(err && err.message) + ')');
        return;
    }
    const entries = json[0].files.map((f) => f.path);
    const expected = ['CHANGELOG.md', 'LICENSE', 'LogN.d.ts', 'LogN.js', 'README.md', 'llms.txt', 'package.json'].sort();
    assert.deepEqual([...entries].sort(), expected, 'pack must be exactly the 6 files[] + package.json');
    for (const p of entries) {
        assert.ok(!p.startsWith('demo/') && !p.includes('/demo/'), 'demo/ leaked into the pack: ' + p);
    }
});

/* -------- serve.mjs: fail-closed matrix ----------------------------------- */

/** Minimal mock response so handle() can be driven without a socket. */
function mockRes() {
    const res = {
        statusCode: 0, headers: {}, chunks: [], ended: false,
        headersSent: false,
        writeHead(code, hdrs) { res.statusCode = code; res.headersSent = true; if (hdrs) Object.assign(res.headers, hdrs); },
        end(body) { if (body !== undefined) res.chunks.push(body); res.ended = true; },
    };
    return res;
}
async function drive(url) { const res = mockRes(); await handle({ url }, res); return res; }

test('serve: /witness.json fails closed on an unknown member/op and on a half-specified filter', async () => {
    const bad = await drive('/witness.json?member=Nope&op=pop');
    assert.equal(bad.statusCode, 400);
    assert.match(JSON.parse(bad.chunks.join('')).error, /unknown witness op-row/);

    const half = await drive('/witness.json?member=BinaryHeap');
    assert.equal(half.statusCode, 400);
    assert.match(JSON.parse(half.chunks.join('')).error, /BOTH member and op/);

    // serveWitness (pure) rejects the same, and OP_ROWS validation is not vacuous.
    assert.throws(() => computeWitnessRow('BinaryHeap.nope'), /unknown witness op-row/);
    assert.throws(() => serveWitness('SkipList', null), /BOTH member and op/);
});

test('serve: /stream.json fails closed on bad steps / n / workload (adversarial)', async () => {
    assert.equal((await drive('/stream.json?steps=-1')).statusCode, 400);
    assert.equal((await drive('/stream.json?steps=abc')).statusCode, 400);
    assert.equal((await drive('/stream.json?workload=bogus')).statusCode, 400);
    assert.equal((await drive('/stream.json?n=0&steps=10')).statusCode, 400);
    // A present-but-invalid seed must fail closed too (not be silently coerced to 1).
    const badSeed = await drive('/stream.json?seed=foo&steps=10');
    assert.equal(badSeed.statusCode, 400);
    assert.match(JSON.parse(badSeed.chunks.join('')).error, /seed must be an unsigned 32-bit integer/);
    assert.throws(() => serveStream(NaN, 31, 'mixed', 10), /seed must be an unsigned 32-bit integer/);
    assert.throws(() => serveStream(1, 31, 'bogus', 10), /workload must be one of/);
    assert.throws(() => serveStream(1, 31, 'mixed', -5), /steps must be an integer/);
    // Teeth: seed=0 is a LEGAL value (normalized to a non-zero LCG state), not a reject.
    assert.equal((await drive('/stream.json?seed=0&steps=10')).statusCode, 200);
});

test('serve: boundary matrix -- N/N+1 caps, empty-string params, literal traversal, empty witness filters', async () => {
    // steps: N (5e6, inclusive max) succeeds, N+1 fails closed.
    const atCap = await drive('/stream.json?steps=5000000');
    assert.equal(atCap.statusCode, 200, 'steps at the 5e6 cap must be accepted');
    const overCap = await drive('/stream.json?steps=5000001');
    assert.equal(overCap.statusCode, 400, 'steps one past the 5e6 cap must fail closed');
    assert.match(JSON.parse(overCap.chunks.join('')).error, /steps must be an integer/);

    // seed: N (0xFFFFFFFF, inclusive max) succeeds, N+1 overflows and fails closed.
    const seedAtCap = await drive('/stream.json?seed=4294967295&steps=1');
    assert.equal(seedAtCap.statusCode, 200, 'seed at the uint32 max must be accepted');
    const seedOverCap = await drive('/stream.json?seed=4294967296&steps=1');
    assert.equal(seedOverCap.statusCode, 400, 'seed one past the uint32 max must fail closed');

    // Empty-string params are PRESENT (not absent): "null is not zero" means an
    // empty string is NOT silently treated as the default. steps='' -> Number('')
    // === 0, a legal literal step count (200, index 0), NOT the 200-step default.
    const emptySteps = await drive('/stream.json?steps=');
    assert.equal(emptySteps.statusCode, 200);
    assert.equal(JSON.parse(emptySteps.chunks.join('')).index, 0,
        'an empty steps param must be read as the literal value 0, not silently defaulted');
    // n='' -> Number('') === 0, which is out of the engine\'s [1, cap] domain -> fails closed.
    const emptyN = await drive('/stream.json?n=&steps=10');
    assert.equal(emptyN.statusCode, 400, 'an empty n param must fail closed (0 is out of [1, cap])');

    // Literal (non-percent-encoded) "../" traversal must resolve CONFINED to
    // REPO_ROOT (package.json genuinely lives there after the strip), never escape.
    const literalUp = await drive('/../package.json');
    assert.equal(literalUp.statusCode, 200);
    assert.equal(JSON.parse(literalUp.chunks.join('')).name, '@zakkster/lite-logn');
    // A deep escape attempt still resolves INSIDE root (no real file there) -> 404, never a throw/500.
    const deepEscape = await drive('/../../../../../../etc/passwd');
    assert.equal(deepEscape.statusCode, 404, 'a deep traversal attempt must stay confined and 404, not escape');

    // /witness.json with BOTH params present but EMPTY strings (distinct from the
    // half-specified/null case already covered): still fails closed, non-crashing.
    const emptyFilter = await drive('/witness.json?member=&op=');
    assert.equal(emptyFilter.statusCode, 400);
    assert.match(JSON.parse(emptyFilter.chunks.join('')).error, /unknown witness op-row/);

    // An entirely unknown, extension-less route 404s (not just missing static files).
    const unknownRoute = await drive('/api/nope');
    assert.equal(unknownRoute.statusCode, 404);
});

test('serve: /stream.json digest matches an in-process engine run (server op-stream is the same LCG)', async () => {
    const res = await drive('/stream.json?seed=1&n=31&workload=mixed&steps=250');
    assert.equal(res.statusCode, 200);
    const payload = JSON.parse(res.chunks.join(''));
    assert.equal(payload.index, 250);
    const engine = createEngine({ seed: 1, n: 31, workload: 'mixed' });
    runSteps(engine, 250);
    assert.equal(payload.digest, digestEngine(engine), 'server-side digest must equal the in-process run');
    // Teeth: a different step count must differ.
    const other = await drive('/stream.json?seed=1&n=31&workload=mixed&steps=251');
    assert.notEqual(JSON.parse(other.chunks.join('')).digest, payload.digest);
});

test('serve: "/" 302-redirects to /demo/visuals.html and the page + its imports load 200', async () => {
    const root = await drive('/');
    assert.equal(root.statusCode, 302);
    assert.equal(root.headers.location, '/demo/visuals.html');
    for (const p of ['/demo/visuals.html', '/demo/Visualize.mjs', '/demo/renderers.mjs', '/LogN.js']) {
        const r = await drive(p);
        assert.equal(r.statusCode, 200, p + ' must load');
    }
});

test('serve: static route 404s a missing file and fails closed on a traversal escape', async () => {
    assert.equal((await drive('/demo/does-not-exist.mjs')).statusCode, 404);
    // Encoded traversal must resolve INSIDE the repo root (confinement), never escape.
    const escaped = await drive('/..%2fpackage.json');
    assert.equal(escaped.statusCode, 200);
    const body = JSON.parse(escaped.chunks.join(''));
    assert.equal(body.name, '@zakkster/lite-logn', 'traversal must be confined to REPO_ROOT');
    // A malformed percent-encoding fails closed (403), not a crash.
    assert.equal(safePath('/%zz'), null);
});

test('serve: happy-path /witness.json?member=BinaryHeap&op=pop returns a well-shaped fit off the shipped kernels', async () => {
    // The cheapest op-row (the family calibrator). Real kernels, real fitLogLinear.
    const res = await drive('/witness.json?member=BinaryHeap&op=pop');
    assert.equal(res.statusCode, 200);
    const payload = JSON.parse(res.chunks.join(''));
    assert.equal(payload.rows.length, 1);
    const row = payload.rows[0];
    assert.equal(row.name, 'BinaryHeap');
    assert.equal(row.op, 'pop');
    assert.ok(Number.isFinite(row.r2) && row.r2 > 0, 'r2 must be a finite positive number');
    assert.ok(Number.isFinite(row.slope), 'slope must be finite');
    assert.ok(row.points.length >= 4, 'must carry the swept points for plotting');
    assert.equal(typeof row.foilName, 'string');
    assert.ok(Number.isFinite(row.foilR2), 'foil fit must be present');
});
