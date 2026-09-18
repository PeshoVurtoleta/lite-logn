// @zakkster/lite-logn -- demo engine (repo-only dev artifact, NEVER shipped).
//
//   npm run demo                 (runs demo/Demo.test.mjs, the gate)
//   node demo/Visualize.mjs      (headless per-member ns/op + log-linear fit table)
//
// The headless visualization engine for the four STRUCTURAL members (BinaryHeap,
// Fenwick, SegmentTree, SkipList). It constructs each member once at a fixed
// capacity, feeds ONE shared seeded LCG op-stream to all four, and reads each
// member's live state via a SINGLE `snapshot(engine, name)` function that reads the
// underscore-prefixed INTERNAL arrays directly (repo-only introspection -- the only
// way to draw tower heights / tree levels / fold nodes without a LogN.js change).
// EVERY internal-field read lives in that one function; the layout-drift guard in
// Demo.test.mjs pins the exact field names so a future LogN.js rename fails loudly.
//
// This module imports ONLY ../LogN.js at the top, so it loads unchanged in the
// browser (demo/visuals.html). The Node-main block (`node demo/Visualize.mjs`)
// DYNAMICALLY imports ../test/witness.mjs -- the SHIPPED witness registry (MEMBERS)
// + fitLogLinear -- so the headline numbers are computed off the shipped kernels,
// never a demo re-implementation. That import is behind the entry-point guard so it
// never runs in the browser (witness.mjs imports node:url).
//
// Throw prefix here is [lite-logn-demo] (tool-scoped) -- NEVER [lite-logn], which
// belongs to the shipped LogN.js alone.

import { BinaryHeap, Fenwick, SegmentTree, SkipList } from '../LogN.js';

/** Tool-scoped throw prefix (NOT [lite-logn], which is for shipped LogN.js). */
export const THROW = '[lite-logn-demo]';

/** Snapshot format tag -- stamped on every snapshot so a stale/foreign object is
 *  distinguishable. Part of the shared base every renderer's model(snap) carries. */
export const SNAP_F = 'logn-demo/1';

/** The four structural members, in panel order. Each constructed once per engine. */
export const MEMBER_NAMES = ['BinaryHeap', 'Fenwick', 'SegmentTree', 'SkipList'];

/** The demo workloads (the op-mix the shared op-stream applies each step). */
export const WORKLOADS = ['mixed', 'random', 'churn'];

/** SkipList tower ceiling (SL_MAXLEVEL in LogN.js): the search-path scratch bound. */
const SL_MAXLEVEL = 32;

/** Max path length a snapshot ever records (log2 of any sane demo capacity + slack). */
const MAX_PATH = 40;

/** Advance a 32-bit NR-LCG one step, kept a signed int32 (mirrors LogN.js _lcgNext,
 *  which is not exported). Deterministic, allocation-free: same seed -> same stream. */
function lcgNext(s) { return (Math.imul(s, 1664525) + 1013904223) | 0; }

/** Coerce a demo seed to a non-zero unsigned 32-bit integer (an all-zero LCG state
 *  never advances -- fail closed to 1, "null is not zero"). */
function normSeed(seed) {
    const s = (seed >>> 0);
    return s === 0 ? 1 : s;
}

/**
 * Build the engine over a spec { cap, n, seed, workload }. All backing snapshot
 * arrays are allocated ONCE here, sized to `cap`, and refilled IN PLACE by
 * snapshot() -- no per-frame allocation. The four members are constructed once and
 * reused for the engine's whole life.
 *
 * @param {{cap?:number,n?:number,seed?:number,workload?:string}} [spec]
 */
export function createEngine(spec) {
    const s = spec || {};
    const cap = s.cap === undefined ? 1024 : s.cap;
    const n = s.n === undefined ? 31 : s.n;
    const seed = normSeed(s.seed === undefined ? 0x9E3779B9 : s.seed);
    const workload = s.workload === undefined ? 'mixed' : s.workload;

    if (!Number.isInteger(cap) || cap < 2) {
        throw new RangeError(THROW + ' engine cap must be an integer >= 2, got ' + String(cap));
    }
    if (!Number.isInteger(n) || n < 1 || n > cap) {
        throw new RangeError(THROW + ' engine n must be an integer in [1, cap], got ' + String(n));
    }
    if (WORKLOADS.indexOf(workload) === -1) {
        throw new RangeError(THROW + ' engine workload must be one of ' + WORKLOADS.join('|') +
            ', got ' + String(workload));
    }

    const members = {
        BinaryHeap: new BinaryHeap(cap, 'min'),
        Fenwick: new Fenwick(cap),
        SegmentTree: new SegmentTree(cap, 'sum'),
        SkipList: new SkipList(cap, seed),
    };

    // Preallocated snapshot objects -- EXACTLY the base fields + each renderer's
    // declared fields, nothing more (a stray key would defeat the model==snap gate).
    const snaps = {
        BinaryHeap: {
            f: SNAP_F, m: 'BinaryHeap', cap,
            n: 0, min: true,
            key: new Float64Array(cap),
            id: new Uint32Array(cap),
            path: new Int32Array(MAX_PATH),
            pathLen: 0,
            target: -1,
        },
        Fenwick: {
            f: SNAP_F, m: 'Fenwick', cap,
            n: 0,
            t: new Float64Array(cap + 1),
            path: new Int32Array(MAX_PATH),
            pathLen: 0,
            target: -1,
        },
        SegmentTree: {
            f: SNAP_F, m: 'SegmentTree', cap,
            n: 0, kind: 2,
            t: new Float64Array(2 * cap),
            path: new Int32Array(MAX_PATH),
            pathLen: 0,
            target: -1,
        },
        SkipList: {
            f: SNAP_F, m: 'SkipList', cap,
            n: 0, level: 1, maxLevel: 0,
            slot: new Uint32Array(cap),
            key: new Float64Array(cap),
            val: new Float64Array(cap),
            height: new Int32Array(cap),
            drop: new Int32Array(SL_MAXLEVEL),
            dropLen: 0,
            target: 0,
            activeSlots: 0,
            freeListLength: 0,
        },
    };

    const engine = {
        cap, n, seed, workload,
        wcode: WORKLOADS.indexOf(workload),
        members,
        snaps,
        // Engine scratch (NOT part of any snapshot): SkipList slot -> order-index map.
        slOrderOf: new Int32Array(cap + 1),
        rng: seed | 0,
        index: 0,
    };
    resetEngine(engine);
    return engine;
}

/** Deterministically fill every member to the working size `n` (ids/keys 0..n-1),
 *  reset the PRNG to the seed and the step index to 0. Cold path (build/reset). */
export function resetEngine(engine) {
    const n = engine.n;
    const bh = engine.members.BinaryHeap;
    const fen = engine.members.Fenwick;
    const seg = engine.members.SegmentTree;
    const sl = engine.members.SkipList;
    bh.clear(); fen.clear(); seg.clear(); sl.clear();
    let r = engine.seed | 0;
    for (let i = 0; i < n; i++) {
        r = lcgNext(r);
        const v = (r >>> 8) & 0xffff;
        bh.push(i, v);
        fen.update(i, v);
        seg.update(i, v);
        sl.set(i, v);
    }
    engine.rng = r;
    engine.index = 0;
    engine.snaps.BinaryHeap.target = n > 0 ? 0 : -1;
    engine.snaps.Fenwick.target = 0;
    engine.snaps.SegmentTree.target = 0;
    engine.snaps.SkipList.target = 0;
    engine.slOrderOf.fill(-1);
}

/**
 * Apply ONE shared op-stream step to all four members. Zero allocation: one LCG
 * draw, integer arithmetic, and public member ops only (no internal reads here --
 * those live in snapshot()). Determinism: the same seed replays the same stream.
 * Returns true always (an endless steady-state stream).
 */
export function step(engine) {
    const w = engine.rng = lcgNext(engine.rng);
    const u = w >>> 0;
    const n = engine.n;
    const idx = u % n;                 // resident index/id/key in [0, n)
    const wc = engine.wcode;           // 0 mixed / 1 random / 2 churn
    // Key value: ascending stream drift for 'random' would be non-random; use the
    // LCG high bits for a bounded, well-mixed key.
    const kv = (w >>> 8) & 0xffff;
    // churn mask: 'churn' every step, 'mixed' every 4th, 'random' never.
    const doChurn = wc === 2 || (wc === 0 && (u & 3) === 0);

    const bh = engine.members.BinaryHeap;
    const fen = engine.members.Fenwick;
    const seg = engine.members.SegmentTree;
    const sl = engine.members.SkipList;

    // BinaryHeap: churn = pop the extremum id then re-push it (steady size, full
    // sift-down + sift-up); else reprioritize a resident id (auto-direction sift).
    if (doChurn) {
        const id = bh.pop();
        if (id !== undefined) { bh.push(id, kv); engine.snaps.BinaryHeap.target = id; }
    } else {
        bh.changeKey(idx, kv);
        engine.snaps.BinaryHeap.target = idx;
    }

    // Fenwick: a balanced +/- point update (no drift over a long soak), climb by i&-i.
    fen.update(idx, (u & 1) ? 1 : -1);
    engine.snaps.Fenwick.target = idx;

    // SegmentTree: an ABSOLUTE bounded leaf set (no drift), then the ancestor climb.
    seg.update(idx, kv);
    engine.snaps.SegmentTree.target = idx;

    // SkipList: churn = delete then re-set the key (exercises the private free-list
    // alloc/free); else an in-place value update (the pure search descent).
    if (doChurn) {
        if (sl.delete(idx)) sl.set(idx, kv);
    } else {
        sl.set(idx, kv);
    }
    engine.snaps.SkipList.target = idx;

    engine.index = (engine.index + 1) | 0;
    return true;
}

/** Run `k` steps (headless). Returns the number of steps taken. */
export function runSteps(engine, k) {
    let i = 0;
    for (; i < k; i++) step(engine);
    return i;
}

/**
 * THE single internal-field reader. Refills the member's PREALLOCATED snapshot IN
 * PLACE from its underscore-prefixed internal arrays and returns it (no allocation).
 * This is the ONLY place in the demo that reads a LogN.js private field; the
 * layout-drift guard in Demo.test.mjs pins every name read below.
 *
 * @param {object} engine
 * @param {string} name  one of MEMBER_NAMES
 */
export function snapshot(engine, name) {
    if (name === 'BinaryHeap') {
        const bh = engine.members.BinaryHeap;
        const s = engine.snaps.BinaryHeap;
        const K = bh._key, I = bh._id, P = bh._pos, cap = bh._cap;
        const nn = bh._n;
        s.n = nn;
        s.min = bh._min;
        for (let i = 0; i < nn; i++) { s.key[i] = K[i]; s.id[i] = I[i]; }
        // Ancestor path of the last-touched id: its current slot up to the root.
        let pl = 0;
        const t = s.target;
        if (t >= 0 && t < cap) {
            let slot = P[t];
            while (slot >= 0 && pl < MAX_PATH) {
                s.path[pl++] = slot;
                if (slot === 0) break;
                slot = (slot - 1) >> 1;
            }
        }
        s.pathLen = pl;
        return s;
    }
    if (name === 'Fenwick') {
        const fen = engine.members.Fenwick;
        const s = engine.snaps.Fenwick;
        const T = fen._t, nn = fen._n;
        s.n = nn;
        for (let k = 0; k <= nn; k++) s.t[k] = T[k];
        // update climb path: from k = i+1, k += k & -k, one cell per level.
        let pl = 0;
        const i = s.target;
        if (i >= 0 && i < nn) {
            for (let k = i + 1; k <= nn && pl < MAX_PATH; k += k & -k) s.path[pl++] = k;
        }
        s.pathLen = pl;
        return s;
    }
    if (name === 'SegmentTree') {
        const seg = engine.members.SegmentTree;
        const s = engine.snaps.SegmentTree;
        const T = seg._t, nn = seg._n;
        s.n = nn;
        s.kind = seg._k;
        const cells = 2 * nn;
        for (let p = 0; p < cells; p++) s.t[p] = T[p];
        // update climb path: from leaf n+i up to the root (one node per level).
        let pl = 0;
        const i = s.target;
        if (i >= 0 && i < nn) {
            for (let p = nn + i; p >= 1 && pl < MAX_PATH; p >>= 1) s.path[pl++] = p;
        }
        s.pathLen = pl;
        return s;
    }
    if (name === 'SkipList') {
        const sl = engine.members.SkipList;
        const s = engine.snaps.SkipList;
        const next = sl._next, K = sl._key, V = sl._val, stride = sl._stride;
        const level = sl._level, size = sl._size;
        s.n = size;
        s.level = level;
        s.maxLevel = sl._maxLevel;
        s.activeSlots = sl._pool.activeSlots;
        s.freeListLength = sl._pool.freeListLength;
        const orderOf = engine.slOrderOf;
        // Level-0 order: the resident slots, ascending; record slot -> order-index.
        let slot = next[0];
        let i = 0;
        while (slot !== 0 && i < s.slot.length) {
            s.slot[i] = slot;
            s.key[i] = K[slot];
            s.val[i] = V[slot];
            s.height[i] = 1;
            orderOf[slot] = i;
            slot = next[slot];
            i++;
        }
        // Tower heights: walk each express level, lift each node it reaches.
        for (let l = 1; l < level; l++) {
            const base = l * stride;
            let sc = next[base];
            while (sc !== 0) {
                const oi = orderOf[sc];
                if (oi >= 0 && s.height[oi] < l + 1) s.height[oi] = l + 1;
                sc = next[base + sc];
            }
        }
        // Search descent for the last target key: per level, the order-index of the
        // predecessor where the search drops down (-1 == the head sentinel).
        let dl = 0;
        const tgt = s.target;
        let cur = 0;
        for (let l = level - 1; l >= 0; l--) {
            const base = l * stride;
            let nx = next[base + cur];
            while (nx !== 0 && K[nx] < tgt) { cur = nx; nx = next[base + cur]; }
            s.drop[dl++] = cur === 0 ? -1 : orderOf[cur];
        }
        s.dropLen = dl;
        return s;
    }
    throw new RangeError(THROW + ' unknown member ' + String(name));
}

/**
 * A 32-bit FNV-1a digest over all four live snapshots (structure + touch paths).
 * Deterministic and allocation-free: the same op-stream yields the same digest, so
 * the browser and the server can cross-check a run without shipping frame payloads.
 * @returns {number} an unsigned 32-bit digest
 */
export function digestEngine(engine) {
    let h = 0x811c9dc5 | 0;
    const mix = (v) => { h = Math.imul(h ^ (v | 0), 0x01000193); };
    for (let mi = 0; mi < MEMBER_NAMES.length; mi++) {
        const s = snapshot(engine, MEMBER_NAMES[mi]);
        mix(s.n);
        mix(s.target);
        mix(s.pathLen === undefined ? s.dropLen : s.pathLen);
        if (s.key) for (let i = 0; i < s.n; i++) mix(s.key[i]);
        if (s.id) for (let i = 0; i < s.n; i++) mix(s.id[i]);
        if (s.t) { const cells = s.m === 'SegmentTree' ? 2 * s.n : s.n + 1; for (let i = 0; i < cells; i++) mix(s.t[i]); }
        if (s.height) for (let i = 0; i < s.n; i++) mix(s.height[i]);
        if (s.path) for (let i = 0; i < s.pathLen; i++) mix(s.path[i]);
        if (s.drop) for (let i = 0; i < s.dropLen; i++) mix(s.drop[i]);
    }
    return h >>> 0;
}

/**
 * The current frame model: every member's live snapshot, keyed by name. The
 * snapshot IS the render model -- renderers.mjs reads only these fields, no shadow
 * state. Called at render time (cold); the returned `members` map is a fresh small
 * object, but each snapshot inside is the engine's reused in-place object.
 */
export function frameModel(engine) {
    const members = {};
    for (let i = 0; i < MEMBER_NAMES.length; i++) {
        const name = MEMBER_NAMES[i];
        members[name] = snapshot(engine, name);
    }
    return { index: engine.index, workload: engine.workload, n: engine.n, members };
}

/* -------------------------------------------------------------------------- *
 * Node-main: `node demo/Visualize.mjs`. DYNAMICALLY imports the SHIPPED witness
 * registry (../test/witness.mjs MEMBERS + fitLogLinear) behind the entry-point
 * guard, so the browser (no `process`) never touches its node:url import. Prints a
 * per-member ns/op + log-linear fit table computed off the shipped kernels.
 * -------------------------------------------------------------------------- */

async function main() {
    const { pathToFileURL } = await import('node:url');
    if (!process.argv[1] || import.meta.url !== pathToFileURL(process.argv[1]).href) return;

    const { MEMBERS, fitLogLinear } = await import('../test/witness.mjs');
    const line = (str) => process.stdout.write(str + '\n');
    line('@zakkster/lite-logn demo -- O(log n) witness readings (shipped kernels)');
    line('fit: nsPerOp = intercept + slope * log2(n)');
    line('');
    line(pad('member.op', 20) + padLeft('R^2', 8) + padLeft('slope', 9) +
        padLeft('foilR^2', 9) + '  foil');
    line('-'.repeat(72));
    for (let i = 0; i < MEMBERS.length; i++) {
        const m = MEMBERS[i];
        const xs = [], ys = [];
        for (const nv of m.sweep) { xs.push(Math.log2(nv)); ys.push(m.run(nv)); }
        const fit = fitLogLinear(xs, ys);
        const fxs = [], fys = [];
        for (const nv of m.foilSweep) { fxs.push(Math.log2(nv)); fys.push(m.foil(nv)); }
        const ffit = fitLogLinear(fxs, fys);
        line(pad(m.name + '.' + m.op, 20) +
            padLeft(fit.r2.toFixed(4), 8) +
            padLeft(fit.slope.toFixed(3), 9) +
            padLeft(ffit.r2.toFixed(4), 9) +
            '  ' + m.foilName);
    }
}

function pad(str, w) { str = String(str); return str.length >= w ? str : str + ' '.repeat(w - str.length); }
function padLeft(str, w) { str = String(str); return str.length >= w ? str : ' '.repeat(w - str.length) + str; }

if (typeof process !== 'undefined' && process.argv) {
    main();
}
