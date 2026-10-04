/**
 * @zakkster/lite-logn -- EulerTourTree (the twentieth member) contract + fuzz suite.
 *
 * EulerTourTree is the LinkCutTree sibling (decisions/0021 D-LCT6 -> 0022): an UNROOTED
 * dynamic forest over a FIXED vertex set under link / cut, answering connected, whole-
 * component folds, and SUBTREE folds in expected O(log n) with zero allocation, over a
 * Henzinger-King Euler tour on a treap with parent pointers.
 *
 * This suite proves, against an adjacency-list + BFS oracle:
 *   - the method contract (surface, getters, fluent returns, singleton identity);
 *   - fuzz parity across 4 kinds x {int, fractional} values, >= 80k ops, 0 mismatches on
 *     connected / componentAggregate / componentSize / subtreeAggregate / subtreeSize /
 *     hasEdge / edges;
 *   - a CROSS-ORACLE stream fed to BOTH LinkCutTree and EulerTourTree: connected agrees
 *     at every step;
 *   - reads are NON-mutating: a snapshot of every structural typed array is byte-identical
 *     before and after every read op;
 *   - boundary doors: every bad id / value / self-link / link-on-connected / cut-non-edge
 *     is a byte-identical no-op;
 *   - a 2^20-vertex PATH graph then subtreeAggregate / componentAggregate / clear with no
 *     RangeError (iterative split / merge, not recursive);
 *   - arc-table churn: link / cut the same pairs 1e6 times, probe lengths stay bounded.
 *
 * ASCII-only.
 */

import test from 'node:test';
import assert from 'node:assert/strict';
import { EulerTourTree, LinkCutTree, ETT_MAX_CAPACITY } from '../LogN.js';

// ---- helpers ---------------------------------------------------------------

function gcd(a, b) { while (b) { const r = a % b; a = b; b = r; } return a; }

function makeRng(seed) {
    let s = seed >>> 0;
    return () => { s = (Math.imul(s, 1664525) + 1013904223) >>> 0; return s / 4294967296; };
}

const IDV = { min: Infinity, max: -Infinity, sum: 0, gcd: 0 };

function foldSet(kind, set, val) {
    let acc = IDV[kind];
    for (const x of set) {
        const w = val[x];
        if (kind === 'min') acc = Math.min(acc, w);
        else if (kind === 'max') acc = Math.max(acc, w);
        else if (kind === 'sum') acc += w;
        else acc = gcd(acc, w);
    }
    return acc;
}

/** Adjacency-list + BFS oracle for the unrooted forest. */
class Oracle {
    constructor(n, kind) {
        this.n = n; this.kind = kind;
        this.adj = Array.from({ length: n }, () => new Set());
        this.val = new Array(n).fill(IDV[kind]);
        this.edges = 0;
    }
    has(u, v) { return this.adj[u].has(v); }
    link(u, v) { this.adj[u].add(v); this.adj[v].add(u); this.edges++; }
    cut(u, v) { this.adj[u].delete(v); this.adj[v].delete(u); this.edges--; }
    setValue(v, x) { this.val[v] = x; }
    comp(v) {
        const seen = new Set([v]); const st = [v];
        while (st.length) { const x = st.pop(); for (const w of this.adj[x]) if (!seen.has(w)) { seen.add(w); st.push(w); } }
        return seen;
    }
    connected(u, v) { return this.comp(u).has(v); }
    compAgg(v) { return foldSet(this.kind, this.comp(v), this.val); }
    compSize(v) { return this.comp(v).size; }
    /** v's side of edge (v, p): reachable from v without crossing the (v, p) edge. */
    side(v, p) {
        const seen = new Set([v]); const st = [v];
        while (st.length) {
            const x = st.pop();
            for (const w of this.adj[x]) { if (x === v && w === p) continue; if (!seen.has(w)) { seen.add(w); st.push(w); } }
        }
        return seen;
    }
    subAgg(v, p) { return foldSet(this.kind, this.side(v, p), this.val); }
    subSize(v, p) { return this.side(v, p).size; }
}

function approxEq(a, b) {
    if (a === b) return true;
    if (typeof a !== 'number' || typeof b !== 'number') return false;
    if (!isFinite(a) || !isFinite(b)) return a === b;
    return Math.abs(a - b) <= 1e-9 * Math.max(1, Math.abs(a), Math.abs(b));
}

// ---- 1. contract -----------------------------------------------------------

test('EulerTourTree: surface, getters, singleton identity, fluent returns', () => {
    assert.equal(typeof ETT_MAX_CAPACITY, 'number');
    assert.equal(ETT_MAX_CAPACITY, 0x10000000);

    const t = new EulerTourTree(6, 'sum');
    assert.equal(t.capacity, 6);
    assert.equal(t.kind, 'sum');
    assert.equal(t.edges, 0);

    // an unset / isolated vertex folds to the identity; each is its own singleton component
    assert.equal(t.at(0), 0);                       // sum identity
    assert.equal(t.componentAggregate(0), 0);
    assert.equal(t.componentSize(0), 1);
    assert.equal(t.connected(0, 1), false);
    assert.equal(t.hasEdge(0, 1), false);

    // identity per kind
    assert.equal(new EulerTourTree(4, 'min').at(0), Infinity);
    assert.equal(new EulerTourTree(4, 'max').at(0), -Infinity);
    assert.equal(new EulerTourTree(4, 'gcd').componentAggregate(0), 0);
    assert.equal(new EulerTourTree(4).kind, 'min');  // default kind

    // fluent returns
    assert.equal(t.setValue(0, 10), t);
    assert.equal(t.link(0, 1), t);
    assert.equal(t.cut(0, 1), t);
    assert.equal(t.clear(), t);

    // a small worked example
    const s = new EulerTourTree(5, 'sum');
    s.setValue(0, 1); s.setValue(1, 2); s.setValue(2, 4); s.setValue(3, 8);
    s.link(0, 1); s.link(1, 2); s.link(1, 3);
    assert.equal(s.edges, 3);
    assert.equal(s.connected(0, 3), true);
    assert.equal(s.connected(0, 4), false);
    assert.equal(s.componentSize(0), 4);
    assert.equal(s.componentAggregate(0), 15);      // 1+2+4+8
    assert.equal(s.hasEdge(1, 3), true);
    assert.equal(s.hasEdge(0, 2), false);
    // subtree of 0 w.r.t. edge (0,1) = {0}; subtree of 1 w.r.t. (1,0) = {1,2,3}
    assert.equal(s.subtreeSize(0, 1), 1);
    assert.equal(s.subtreeAggregate(0, 1), 1);
    assert.equal(s.subtreeSize(1, 0), 3);
    assert.equal(s.subtreeAggregate(1, 0), 14);     // 2+4+8
    // subtree of 2 w.r.t. (2,1) = {2}
    assert.equal(s.subtreeAggregate(2, 1), 4);

    // clear() returns to the pristine singleton forest
    s.clear();
    assert.equal(s.edges, 0);
    assert.equal(s.connected(0, 1), false);
    assert.equal(s.at(0), 0);
    assert.equal(s.componentSize(0), 1);
});

// ---- 2. fuzz vs the BFS oracle (4 kinds x int/frac, >= 80k ops) -------------

test('EulerTourTree: fuzz parity vs an adjacency + BFS oracle (4 kinds x int/frac, >= 80k ops, 0 mismatch)', () => {
    const kinds = ['min', 'max', 'sum', 'gcd'];
    let total = 0;
    for (const kind of kinds) {
        for (const frac of [false, true]) {
            const n = 50;
            const rng = makeRng(0xA17 + kind.charCodeAt(1) * 31 + (frac ? 101 : 0));
            const ett = new EulerTourTree(n, kind);
            const orc = new Oracle(n, kind);
            const genVal = () => {
                if (kind === 'gcd') return Math.floor(rng() * 60);
                return frac ? (rng() * 40 - 20) : Math.floor(rng() * 80 - 40);
            };
            for (let v = 0; v < n; v++) { const x = genVal(); ett.setValue(v, x); orc.setValue(v, x); }

            const ops = 11000;
            for (let op = 0; op < ops; op++) {
                total++;
                const r = rng();
                if (r < 0.33) {                       // link
                    const u = Math.floor(rng() * n), v = Math.floor(rng() * n);
                    if (u !== v && !orc.connected(u, v)) { ett.link(u, v); orc.link(u, v); }
                } else if (r < 0.52) {                // cut an existing edge
                    const u = Math.floor(rng() * n); const nb = [...orc.adj[u]];
                    if (nb.length) { const v = nb[Math.floor(rng() * nb.length)]; ett.cut(u, v); orc.cut(u, v); }
                } else if (r < 0.67) {                // setValue
                    const v = Math.floor(rng() * n); const x = genVal(); ett.setValue(v, x); orc.setValue(v, x);
                } else {                              // queries
                    const u = Math.floor(rng() * n), v = Math.floor(rng() * n);
                    assert.equal(ett.connected(u, v), orc.connected(u, v), kind + ' connected');
                    assert.equal(ett.hasEdge(u, v), orc.has(u, v), kind + ' hasEdge');
                    assert.equal(ett.componentSize(v), orc.compSize(v), kind + ' componentSize');
                    assert.ok(approxEq(ett.componentAggregate(v), orc.compAgg(v)), kind + ' componentAggregate');
                    const nb = [...orc.adj[v]];
                    if (nb.length) {
                        const p = nb[Math.floor(rng() * nb.length)];
                        assert.equal(ett.subtreeSize(v, p), orc.subSize(v, p), kind + ' subtreeSize');
                        assert.ok(approxEq(ett.subtreeAggregate(v, p), orc.subAgg(v, p)), kind + ' subtreeAggregate');
                    }
                }
                assert.equal(ett.edges, orc.edges, kind + ' edges');
            }
        }
    }
    assert.ok(total >= 80000, 'ran at least 80k fuzz ops, got ' + total);
});

// ---- 3. cross-oracle vs LinkCutTree ----------------------------------------

test('EulerTourTree vs LinkCutTree: connected agrees at every step of one link/cut stream', () => {
    const n = 48;
    const rng = makeRng(0xC0FFEE);
    const ett = new EulerTourTree(n, 'min');
    const lct = new LinkCutTree(n, 'min');
    const edges = new Set();                          // canonical "a,b" (a < b)
    const key = (a, b) => (a < b ? a + ',' + b : b + ',' + a);
    let steps = 0;
    for (let op = 0; op < 80000; op++) {
        const r = rng();
        if (r < 0.5) {                                // try a link
            const u = Math.floor(rng() * n), v = Math.floor(rng() * n);
            if (u !== v && !ett.connected(u, v)) {    // both agree the link is legal (LCT uses the same test)
                assert.equal(lct.connected(u, v), false, 'LCT agrees the endpoints are unconnected pre-link');
                ett.link(u, v);
                lct.link(u, v);                       // LCT.link(child, parent): child = u
                edges.add(key(u, v));
            }
        } else {                                      // try a cut of an existing edge
            if (edges.size) {
                const arr = [...edges];
                const e = arr[Math.floor(rng() * arr.length)];
                const [a, b] = e.split(',').map(Number);
                ett.cut(a, b);
                // LCT.cut(node) severs node from its parent. Re-root at b so a's parent is b, then cut(a).
                lct.evert(b);
                lct.cut(a);
                edges.delete(e);
            }
        }
        // connected agrees at EVERY step for a few random probes
        for (let q = 0; q < 3; q++) {
            const x = Math.floor(rng() * n), y = Math.floor(rng() * n);
            assert.equal(ett.connected(x, y), lct.connected(x, y), 'connected disagreement at step ' + op);
            steps++;
        }
    }
    assert.ok(steps > 200000);
});

// ---- 4. reads are non-mutating ---------------------------------------------

test('EulerTourTree: every read op leaves all structural typed arrays byte-identical', () => {
    const n = 40;
    const rng = makeRng(0x5EED);
    const ett = new EulerTourTree(n, 'sum');
    for (let v = 0; v < n; v++) ett.setValue(v, (v * 7 + 3) % 29 - 14);
    // build a random recursive forest with some churn
    for (let v = 1; v < n; v++) { const p = Math.floor(rng() * v); if (!ett.connected(v, p)) ett.link(v, p); }
    for (let i = 0; i < 40; i++) {
        const u = Math.floor(rng() * n); const nb = [];
        for (let w = 0; w < n; w++) if (ett.hasEdge(u, w)) nb.push(w);
        if (nb.length) { const v = nb[Math.floor(rng() * nb.length)]; ett.cut(u, v); const p = Math.floor(rng() * n); if (!ett.connected(u, p) && u !== p) ett.link(u, p); }
    }

    const cols = ['_left', '_right', '_parent', '_prio', '_size', '_vcnt', '_val', '_agg', '_arcFrom', '_arcTo', '_arcSlot'];
    const snap = () => cols.map((c) => ett[c].slice());
    const equalTo = (s) => cols.every((c, idx) => {
        const a = ett[c], b = s[idx];
        if (a.length !== b.length) return false;
        for (let i = 0; i < a.length; i++) if (a[i] !== b[i]) return false;
        return true;
    });

    // find an existing edge for the subtree reads
    let ev = -1, ep = -1;
    for (let v = 0; v < n && ev < 0; v++) for (let w = 0; w < n; w++) if (ett.hasEdge(v, w)) { ev = v; ep = w; break; }
    assert.ok(ev >= 0, 'the forest has at least one edge');

    const reads = [
        () => ett.connected(0, 5),
        () => ett.componentAggregate(3),
        () => ett.componentSize(7),
        () => ett.subtreeAggregate(ev, ep),
        () => ett.subtreeSize(ev, ep),
        () => ett.hasEdge(ev, ep),
        () => ett.at(11),
    ];
    for (const read of reads) {
        const before = snap();
        read();
        assert.ok(equalTo(before), 'a read op mutated a structural typed array: ' + read.toString());
    }
    // also the live LCG state (_seed) is untouched by reads
    const seedBefore = ett._seed;
    for (const read of reads) read();
    assert.equal(ett._seed, seedBefore, 'reads must not step the PRNG');
});

// ---- 5. boundary doors: byte-identical no-op after each rejection ----------

test('EulerTourTree: every rejected door is a byte-identical no-op', () => {
    const n = 16;
    const rng = makeRng(0xB00);
    const ett = new EulerTourTree(n, 'sum');
    for (let v = 0; v < n; v++) ett.setValue(v, v - 8);
    for (let v = 1; v < n; v++) { const p = Math.floor(rng() * v); if (!ett.connected(v, p)) ett.link(v, p); }

    const cols = ['_left', '_right', '_parent', '_prio', '_size', '_vcnt', '_val', '_agg', '_arcFrom', '_arcTo', '_arcSlot'];
    const snap = () => cols.map((c) => ett[c].slice());
    const unchanged = (s) => cols.every((c, idx) => {
        const a = ett[c], b = s[idx];
        for (let i = 0; i < a.length; i++) if (a[i] !== b[i]) return false;
        return true;
    });
    const seed0 = ett._seed, edges0 = ett.edges;

    const badIds = [-1, 1.5, NaN, Infinity, '1', 1n, Symbol('x'), null, undefined, {}, [], true, n, n + 1];
    const rejects = [];
    for (const bad of badIds) {
        rejects.push(() => ett.link(bad, 0), () => ett.link(0, bad), () => ett.cut(bad, 0),
            () => ett.connected(bad, 0), () => ett.hasEdge(0, bad), () => ett.at(bad),
            () => ett.componentAggregate(bad), () => ett.componentSize(bad),
            () => ett.subtreeAggregate(bad, 0), () => ett.subtreeSize(0, bad), () => ett.setValue(bad, 1));
    }
    // bad values
    for (const bad of [NaN, Infinity, -Infinity, '1', 1n, null, {}, Symbol('v'), true]) {
        rejects.push(() => ett.setValue(0, bad));
    }
    // sum-bound reject at bound * 1.0000001
    rejects.push(() => ett.setValue(0, ett._sumBound * 1.0000001));
    // self-link, link on connected, cut non-edge, subtree non-edge
    rejects.push(() => ett.link(3, 3));
    // pick two already-connected vertices and a non-edge pair
    let cu = -1, cv = -1;
    for (let a = 0; a < n && cu < 0; a++) for (let b = 0; b < n; b++) if (a !== b && ett.connected(a, b)) { cu = a; cv = b; break; }
    if (cu >= 0) rejects.push(() => ett.link(cu, cv));
    rejects.push(() => ett.cut(0, 0));
    rejects.push(() => ett.subtreeAggregate(0, 0));

    for (const r of rejects) {
        const before = snap();
        assert.throws(r, /\[lite-logn\]/, 'door should throw [lite-logn]: ' + r.toString());
        assert.ok(unchanged(before), 'a rejected door mutated state: ' + r.toString());
    }
    assert.equal(ett._seed, seed0, 'a rejected door stepped the PRNG');
    assert.equal(ett.edges, edges0, 'a rejected door changed the edge count');

    // sum bound: a finite sweep AT the bound is accepted
    const sb = ett._sumBound;
    for (const x of [sb, -sb, sb * 0.5, 0, 1, -1]) {
        assert.doesNotThrow(() => ett.setValue(1, x), 'value at/below the bound is accepted: ' + x);
    }
});

// ---- 6. deep shape: a 2^20-vertex path (no RangeError) ---------------------

test('EulerTourTree: a 2^20-vertex path, then subtree / component folds and clear, no RangeError', () => {
    const N = 1 << 20;
    const t = new EulerTourTree(N, 'sum');
    assert.doesNotThrow(() => { for (let v = 1; v < N; v++) t.link(v, v - 1); }, 'build a 2^20 path without RangeError');
    assert.equal(t.edges, N - 1);
    assert.equal(t.componentSize(0), N);
    t.setValue(0, 100); t.setValue(N - 1, 7);
    // v's side of edge (1, 0) = {1 .. N-1}; includes N-1 (=7), not 0
    assert.equal(t.subtreeSize(1, 0), N - 1);
    assert.equal(t.subtreeAggregate(1, 0), 7);
    assert.equal(t.componentAggregate(N >> 1), 107);
    assert.doesNotThrow(() => t.clear(), 'clear() on the deep shape without RangeError');
    assert.equal(t.componentSize(0), 1);
    assert.equal(t.edges, 0);
});

// ---- 7. arc-table churn: probe lengths stay bounded ------------------------

test('EulerTourTree: arc-table churn (1e6 link/cut of the same pairs) keeps probe lengths bounded', () => {
    const M = 2048;
    const e = new EulerTourTree(M, 'min');
    const es = [];
    for (let v = 1; v < M; v++) { e.link(v, v - 1); es.push([v, v - 1]); }
    const E = es.length;
    const probeLen = (from, to) => {
        const mask = e._arcMask; let h = e._arcHash(from, to) & mask; let n = 0;
        for (; ;) { const s = e._arcSlot[h]; n++; if (s === 0) return n; if (e._arcFrom[h] === from && e._arcTo[h] === to) return n; h = (h + 1) & mask; }
    };
    let maxp = 0;
    for (let i = 0; i < 1000000; i++) {
        const [a, b] = es[i % E];
        e.cut(a, b); e.link(a, b);
        if ((i & 4095) === 0) { for (const [a2, b2] of es) { const p = probeLen(a2, b2); if (p > maxp) maxp = p; } }
    }
    for (const [a2, b2] of es) { const p = probeLen(a2, b2); if (p > maxp) maxp = p; }
    assert.ok(maxp <= 32, 'max arc-table probe length stays bounded under churn, got ' + maxp);
    // the forest is still intact: one path component of M vertices
    assert.equal(e.edges, M - 1);
    assert.equal(e.componentSize(0), M);
});

test('EulerTourTree: clear() after churn is byte-identical to a fresh instance (columns, arc table, pool, PRNG)', () => {
    const COLS = ['_left', '_right', '_parent', '_prio', '_size', '_vcnt', '_val', '_agg', '_arcFrom', '_arcTo', '_arcSlot'];
    for (const kind of ['min', 'max', 'sum', 'gcd']) {
        const V = 97;
        const fresh = new EulerTourTree(V, kind);
        const t = new EulerTourTree(V, kind);
        const rnd = makeRng(0xC1EA + V);
        for (let i = 0; i < 5000; i++) {
            const u = (rnd() * V) | 0, v = (rnd() * V) | 0;
            if (u !== v && !t.connected(u, v)) t.link(u, v);
            else if (t.hasEdge(u, v)) t.cut(u, v);
            t.setValue(u, kind === 'gcd' ? ((rnd() * 1000) | 0) : (rnd() * 1000) | 0);
        }
        assert.ok(t.edges > 0, 'the churn left edges behind (non-vacuous)');
        t.clear();
        for (const c of COLS) {
            assert.deepEqual(Buffer.from(t[c].buffer), Buffer.from(fresh[c].buffer), kind + ' ' + c);
        }
        assert.equal(t._seed, fresh._seed, kind + ' PRNG reset');
        assert.equal(t.edges, 0);
        assert.equal(t._pool._freeLen, fresh._pool._freeLen, kind + ' pool length');
        assert.deepEqual(Buffer.from(t._pool._free.buffer), Buffer.from(fresh._pool._free.buffer), kind + ' pool order');
    }
});
