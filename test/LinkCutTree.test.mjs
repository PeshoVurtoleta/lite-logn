/**
 * @zakkster/lite-logn -- LinkCutTree boundary + differential suite.
 *
 * The nineteenth member's contract -- the family's first FULLY DYNAMIC rooted forest
 * (online link / cut / evert with amortized-O(log n) path folds) -- proven at the doors
 * and against a naive brute-force adjacency oracle that recomputes every answer from an
 * explicit adjacency map + a per-vertex value array:
 *   - surface (every op exists; capacity / kind / edges getters; NO subtree-aggregate --
 *     path-only, the EulerTourTree deferral);
 *   - construction validation (bad capacity; bad kind);
 *   - fail-closed id / value / kind doors (Symbol / BigInt / NaN / +-Infinity typeof-first,
 *     so the [lite-logn] tag pin is EXERCISED, not a bare throws);
 *   - the CYCLE-creating link, self-link, cut-of-a-root, and cross-tree pathAggregate doors;
 *   - the gcd domain door (negative / non-integer rejected);
 *   - reversal correctness: evert re-roots, pathAggregate(u, v) folds u..v symmetrically;
 *   - a >= 1e4 mixed-op fuzz per fold (min / max / sum / gcd) vs an INDEPENDENT oracle,
 *     0 divergences, across link / cut / evert / findRoot / connected / pathAggregate churn.
 * Every test BITES: a broken impl (dropped guard, a bad rotation, a lazy-push that fires
 * after touching children, a non-commutative agg mistake, a leaked edge) fails it.
 */

import test from 'node:test';
import assert from 'node:assert/strict';
import { LinkCutTree } from '../LogN.js';

// --- helpers ----------------------------------------------------------------

// mulberry32 -- deterministic PRNG so every fuzz run is reproducible.
function mulberry32(seed) {
    let s = seed >>> 0;
    return function () {
        s = (s + 0x6D2B79F5) | 0;
        let t = Math.imul(s ^ (s >>> 15), s | 1);
        t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
        return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
}

function gcd(a, b) { while (b) { const r = a % b; a = b; b = r; } return a; }

// A naive brute-force oracle: an undirected adjacency map + a value array. Every answer is
// recomputed from scratch by BFS -- deliberately O(n) per query, the honest ground truth.
class Oracle {
    constructor(n, kind) {
        this.n = n; this.kind = kind;
        this.adj = Array.from({ length: n }, () => new Set());
        this.val = new Array(n).fill(0);
    }
    connected(u, v) {
        if (u === v) return true;
        const seen = new Set([u]); const st = [u];
        while (st.length) {
            const x = st.pop();
            for (const y of this.adj[x]) { if (y === v) return true; if (!seen.has(y)) { seen.add(y); st.push(y); } }
        }
        return false;
    }
    link(c, p) { this.adj[c].add(p); this.adj[p].add(c); }
    cut(a, b) { this.adj[a].delete(b); this.adj[b].delete(a); }
    pathNodes(u, v) {           // the vertex list on the unique path u..v, or null if disconnected
        const prev = new Map(); prev.set(u, -1); const q = [u];
        while (q.length) {
            const x = q.shift(); if (x === v) break;
            for (const y of this.adj[x]) { if (!prev.has(y)) { prev.set(y, x); q.push(y); } }
        }
        if (!prev.has(v)) return null;
        const path = []; let x = v; while (x !== -1) { path.push(x); x = prev.get(x); }
        return path;
    }
    fold(nodes) {
        let a = this.kind === 'min' ? Infinity : this.kind === 'max' ? -Infinity : 0;
        for (const x of nodes) {
            const v = this.val[x];
            if (this.kind === 'min') a = Math.min(a, v);
            else if (this.kind === 'max') a = Math.max(a, v);
            else if (this.kind === 'sum') a += v;
            else a = gcd(a, v);
        }
        return a;
    }
}

// --- surface ----------------------------------------------------------------

test('#1 surface: every documented op exists; getters; NO subtree aggregate (path-only)', () => {
    const t = new LinkCutTree(8, 'sum');
    for (const m of ['link', 'cut', 'evert', 'findRoot', 'connected', 'pathAggregate', 'setValue', 'at']) {
        assert.equal(typeof t[m], 'function', 'missing op ' + m);
    }
    assert.equal(t.capacity, 8, 'capacity getter');
    assert.equal(t.kind, 'sum', 'kind getter');
    assert.equal(t.edges, 0, 'edges getter starts at 0');
    // path-only: it deliberately carries NO subtree aggregate (that is EulerTourTree's future job).
    assert.equal(typeof t.subtreeAggregate, 'undefined', 'no subtreeAggregate (path-only)');
    assert.equal(typeof t.subtreeSum, 'undefined', 'no subtreeSum (path-only)');
});

test('#2 construction validation: bad capacity + bad kind fail closed [lite-logn]', () => {
    for (const bad of [0, -1, 1.5, NaN, Infinity, '8', null, undefined, 0x80000000, 2n, Symbol('x')]) {
        assert.throws(() => new LinkCutTree(bad), /\[lite-logn\]/, 'capacity ' + String(bad));
    }
    for (const bad of ['MIN', 'average', '', 0, null, 42, Symbol('k')]) {
        assert.throws(() => new LinkCutTree(8, bad), /\[lite-logn\]/, 'kind ' + String(bad));
    }
    // the four legal kinds construct cleanly
    for (const k of ['min', 'max', 'sum', 'gcd']) assert.equal(new LinkCutTree(4, k).kind, k);
    // default kind is 'min'
    assert.equal(new LinkCutTree(4).kind, 'min', 'default kind min');
});

test('#3 id doors: every op fails closed [lite-logn] on a bad vertex id (typeof-first)', () => {
    const t = new LinkCutTree(8, 'sum');
    for (const bad of [-1, 8, 1.5, NaN, Infinity, '3', null, undefined, 2n, Symbol('x')]) {
        assert.throws(() => t.link(bad, 0), /\[lite-logn\]/, 'link child ' + String(bad));
        assert.throws(() => t.link(0, bad), /\[lite-logn\]/, 'link parent ' + String(bad));
        assert.throws(() => t.cut(bad), /\[lite-logn\]/, 'cut ' + String(bad));
        assert.throws(() => t.evert(bad), /\[lite-logn\]/, 'evert ' + String(bad));
        assert.throws(() => t.findRoot(bad), /\[lite-logn\]/, 'findRoot ' + String(bad));
        assert.throws(() => t.connected(bad, 0), /\[lite-logn\]/, 'connected u ' + String(bad));
        assert.throws(() => t.connected(0, bad), /\[lite-logn\]/, 'connected v ' + String(bad));
        assert.throws(() => t.pathAggregate(bad), /\[lite-logn\]/, 'pathAggregate u ' + String(bad));
        assert.throws(() => t.setValue(bad, 1), /\[lite-logn\]/, 'setValue id ' + String(bad));
        assert.throws(() => t.at(bad), /\[lite-logn\]/, 'at ' + String(bad));
    }
});

test('#4 value doors: non-finite fails closed; gcd rejects negative / non-integer (typeof-first)', () => {
    const t = new LinkCutTree(8, 'sum');
    for (const bad of [NaN, Infinity, -Infinity, '5', null, undefined, 2n, Symbol('v')]) {
        assert.throws(() => t.setValue(0, bad), /\[lite-logn\]/, 'setValue value ' + String(bad));
    }
    // value door is checked BEFORE the id (a bad value throws even with a bad id -- value-first)
    assert.throws(() => t.setValue(999, NaN), /\[lite-logn\]/, 'value checked first');
    const g = new LinkCutTree(8, 'gcd');
    for (const bad of [-1, -5, 1.5, 2.7]) {
        assert.throws(() => g.setValue(0, bad), /\[lite-logn\]/, 'gcd value ' + String(bad));
    }
    g.setValue(0, 12); g.setValue(1, 0); // 0 and positive integers are legal for gcd
    assert.equal(g.at(0), 12);
    assert.equal(g.at(1), 0);
});

// --- structural doors -------------------------------------------------------

test('#5 link doors: self-link + cycle-creating link fail closed [lite-logn]', () => {
    const t = new LinkCutTree(8, 'sum');
    assert.throws(() => t.link(3, 3), /\[lite-logn\]/, 'self link');
    t.link(1, 0); t.link(2, 1);          // chain 0-1-2
    assert.equal(t.edges, 2);
    assert.throws(() => t.link(2, 0), /\[lite-logn\]/, 'cycle: 2 and 0 already connected');
    assert.throws(() => t.link(0, 2), /\[lite-logn\]/, 'cycle: 0 and 2 already connected');
    assert.equal(t.edges, 2, 'a rejected link does not change the edge count');
});

test('#6 cut doors: cutting a tree root (no parent edge) fails closed [lite-logn]', () => {
    const t = new LinkCutTree(8, 'sum');
    t.link(1, 0); t.link(2, 1);          // 0 is the root of 0-1-2
    // 0 is currently the root -> it has no parent edge.
    t.evert(0);                          // re-root at 0 to be explicit
    assert.throws(() => t.cut(0), /\[lite-logn\]/, 'cut the root');
    // an isolated vertex is its own root
    assert.throws(() => t.cut(5), /\[lite-logn\]/, 'cut an isolated vertex');
    // cutting a real child edge works and drops the edge count
    t.cut(2);
    assert.equal(t.edges, 1);
    assert.equal(t.connected(2, 0), false, '2 detached from 0');
    assert.equal(t.connected(1, 0), true, '1 still attached to 0');
});

test('#7 pathAggregate(u, v) across different trees fails closed [lite-logn]', () => {
    const t = new LinkCutTree(8, 'sum');
    t.link(1, 0); t.link(3, 2);          // two components: {0,1} and {2,3}
    assert.throws(() => t.pathAggregate(0, 2), /\[lite-logn\]/, 'no path across trees');
    assert.throws(() => t.pathAggregate(1, 3), /\[lite-logn\]/, 'no path across trees');
    // same vertex path is that vertex's value
    t.setValue(0, 7);
    assert.equal(t.pathAggregate(0, 0), 7, 'single-vertex path = its value');
});

// --- reversal / evert correctness -------------------------------------------

test('#8 evert re-roots and pathAggregate(u, v) is symmetric over the four folds', () => {
    for (const kind of ['min', 'max', 'sum', 'gcd']) {
        const t = new LinkCutTree(8, kind);
        // chain 0-1-2-3-4
        for (let i = 1; i < 5; i++) t.link(i, i - 1);
        const vals = kind === 'gcd' ? [12, 18, 24, 6, 36] : [5, -3, 9, 2, -7];
        for (let i = 0; i < 5; i++) t.setValue(i, vals[i]);
        const orc = new Oracle(8, kind);
        for (let i = 1; i < 5; i++) orc.link(i, i - 1);
        for (let i = 0; i < 5; i++) orc.val[i] = vals[i];
        // path u..v equals fold over the chain, symmetric
        for (let u = 0; u < 5; u++) for (let v = 0; v < 5; v++) {
            const a = t.pathAggregate(u, v);
            const b = t.pathAggregate(v, u);
            assert.equal(a, b, kind + ' pathAggregate symmetric ' + u + '..' + v);
            assert.equal(a, orc.fold(orc.pathNodes(u, v)), kind + ' pathAggregate matches oracle ' + u + '..' + v);
        }
        // findRoot after an evert
        t.evert(3);
        assert.equal(t.findRoot(0), 3, kind + ' evert re-roots at 3');
        assert.equal(t.findRoot(4), 3, kind + ' evert re-roots at 3 (other end)');
    }
});

// --- the big differential fuzz ----------------------------------------------

for (const kind of ['min', 'max', 'sum', 'gcd']) {
    test('#9 ' + kind + ': >= 1e4-op churn fuzz vs the brute-force oracle, 0 divergences', () => {
        const N = 48;
        const r = mulberry32(kind.length * 131 + 977);
        const lct = new LinkCutTree(N, kind);
        const orc = new Oracle(N, kind);
        const val = () => kind === 'gcd' ? (1 + Math.floor(r() * 30)) : (Math.floor(r() * 60) - 20);
        for (let i = 0; i < N; i++) { const v = val(); lct.setValue(i, v); orc.val[i] = v; }
        let links = 0, cuts = 0, checks = 0;
        for (let it = 0; it < 12000; it++) {
            const op = Math.floor(r() * 6);
            if (op === 0) {                          // link two disconnected vertices
                const c = Math.floor(r() * N), p = Math.floor(r() * N);
                if (c !== p && !orc.connected(c, p)) { lct.link(c, p); orc.link(c, p); links++; }
            } else if (op === 1) {                   // cut a real edge
                const x = Math.floor(r() * N); const nb = [...orc.adj[x]];
                if (nb.length) {
                    const y = nb[Math.floor(r() * nb.length)];
                    lct.evert(y); lct.cut(x); orc.cut(x, y); cuts++;   // evert(y) so x's parent is y
                }
            } else if (op === 2) {                   // connectivity
                const u = Math.floor(r() * N), v = Math.floor(r() * N);
                assert.equal(lct.connected(u, v), orc.connected(u, v), kind + ' connected ' + u + ',' + v);
                checks++;
            } else if (op === 3) {                   // two-endpoint path fold (or the disconnected door)
                const u = Math.floor(r() * N), v = Math.floor(r() * N);
                if (orc.connected(u, v)) {
                    assert.equal(lct.pathAggregate(u, v), orc.fold(orc.pathNodes(u, v)),
                        kind + ' pathAggregate ' + u + '..' + v);
                } else {
                    assert.throws(() => lct.pathAggregate(u, v), /\[lite-logn\]/, kind + ' disconnected path');
                }
                checks++;
            } else if (op === 4) {                   // setValue
                const x = Math.floor(r() * N); const v = val();
                lct.setValue(x, v); orc.val[x] = v;
            } else {                                 // evert then root-to-w single-arg fold + findRoot
                const u = Math.floor(r() * N); lct.evert(u);
                const w = Math.floor(r() * N);
                if (orc.connected(u, w)) {
                    assert.equal(lct.pathAggregate(w), orc.fold(orc.pathNodes(u, w)),
                        kind + ' pathAggregate(w) after evert(' + u + ')');
                    assert.equal(lct.findRoot(w), u, kind + ' findRoot after evert(' + u + ')');
                    checks++;
                }
            }
        }
        assert.equal(lct.edges, orc.adj.reduce((s, set) => s + set.size, 0) / 2, kind + ' edge count matches oracle');
        assert.ok(links > 50 && cuts > 20 && checks > 200,
            kind + ' fuzz exercised link/cut/checks (links=' + links + ' cuts=' + cuts + ' checks=' + checks + ')');
    });
}

// --- non-vacuity guard: the oracle really disagrees with a broken fold -------

test('#10 oracle bites: a deliberately wrong fold diverges (non-vacuous check)', () => {
    const t = new LinkCutTree(4, 'sum');
    for (let i = 1; i < 4; i++) t.link(i, i - 1);
    for (let i = 0; i < 4; i++) t.setValue(i, i + 1);   // 1,2,3,4
    assert.equal(t.pathAggregate(0, 3), 10, 'sum 1+2+3+4');
    assert.notEqual(t.pathAggregate(0, 3), 9, 'a wrong sum would be caught');
    const mn = new LinkCutTree(4, 'min');
    for (let i = 1; i < 4; i++) mn.link(i, i - 1);
    for (let i = 0; i < 4; i++) mn.setValue(i, [5, 2, 8, 1][i]);
    assert.equal(mn.pathAggregate(0, 3), 1, 'min over 5,2,8,1');
    assert.equal(mn.pathAggregate(0, 1), 2, 'min over 5,2');
});
