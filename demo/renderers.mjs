// @zakkster/lite-logn -- per-member renderers (repo-only dev artifact, NEVER shipped).
//
// One renderer per structural member, each driven STRICTLY off that member's
// snapshot (Visualize.snapshot -- the SINGLE internal-field reader). A renderer
// reads ONLY snapshot fields and computes pixel geometry (rendering), never member
// state (which would be shadow mechanics).
//
// Each renderer declares `fields` (the member-specific snapshot keys it consumes)
// and a `model(snap)` that reassembles the snapshot from EXACTLY those keys + the
// shared base. Demo.test.mjs asserts model(snap) deep-equals the live snapshot for
// every member: a dropped field (silently unrendered) or an invented field both
// fail. draw(g, snap, geom) uses a CanvasRenderingContext2D and runs in the browser
// only; the model() path is pure and is what the node test exercises.
//
// This module imports NOTHING (pure); demo/visuals.html loads it beside
// ./Visualize.mjs. Repo-only; never shipped.

/** The base snapshot fields every member carries (set in Visualize.createEngine):
 *  format tag, member name, capacity. */
export const BASE_FIELDS = ['f', 'm', 'cap'];

/** Reassemble a snapshot from the base fields + a member's own fields. If `fields`
 *  omits a key the snapshot carries, the result is missing it (deep-equal fails ->
 *  a silently unrendered field); if `fields` names a key the snapshot does NOT
 *  carry, the result holds `undefined` under it (deep-equal fails -> an invented
 *  field). Either way the model==snapshot gate bites. */
function pick(snap, fields) {
    const o = {};
    for (let i = 0; i < BASE_FIELDS.length; i++) o[BASE_FIELDS[i]] = snap[BASE_FIELDS[i]];
    for (let i = 0; i < fields.length; i++) o[fields[i]] = snap[fields[i]];
    return o;
}

/* ------------------------------- palette --------------------------------- */
// Hex first (a browser that ignores anything else falls back cleanly).
const COL = {
    bg: '#0c1512',
    cell: '#12261c',
    cellEdge: '#2b5a44',
    path: '#ffcf5a',       // the O(log n) touch path (sift / i&-i climb / fold spine)
    pathFill: '#3a2f10',
    node: '#1c3a2a',
    express: '#37e08a',    // skip-list express lane links
    text: '#cfe8d8',
    dim: '#7fa591',
    label: '#9fe3bf',
    root: '#46f',
};

const CELL_W = 30;
const CELL_H = 22;
const GAP = 4;

/** True iff `v` appears in the first `len` cells of the Int32Array `path`. */
function onPath(path, len, v) {
    for (let i = 0; i < len; i++) if (path[i] === v) return true;
    return false;
}

/* ----------------------------- renderers --------------------------------- */

export const RENDERERS = {
    // BinaryHeap: the tree drawn level by level (slot 0 root, children 2i+1/2i+2);
    // the last-touched id's root->slot ancestor path is the highlighted sift spine.
    BinaryHeap: {
        fields: ['n', 'min', 'key', 'id', 'path', 'pathLen', 'target'],
        model(s) { return pick(s, this.fields); },
        draw(g, s, geom) {
            const x0 = geom.x, y0 = geom.y + 18, w = geom.w;
            g.fillStyle = COL.label;
            g.font = '11px ui-monospace, monospace';
            g.fillText(s.min ? 'min-heap (' + s.n + ') -- sift path lit' :
                'max-heap (' + s.n + ') -- sift path lit', x0, geom.y + 12);
            let level = 0, start = 0;
            while (start < s.n) {
                const count = 1 << level;
                const rowN = Math.min(count, s.n - start);
                const rowW = rowN * (CELL_W + GAP);
                let cx = x0 + Math.max(0, (w - rowW) / 2);
                const cy = y0 + level * (CELL_H + 16);
                for (let j = 0; j < rowN; j++) {
                    const slot = start + j;
                    const lit = onPath(s.path, s.pathLen, slot);
                    g.fillStyle = lit ? COL.pathFill : COL.cell;
                    g.fillRect(cx, cy, CELL_W, CELL_H);
                    g.lineWidth = lit ? 2 : 1;
                    g.strokeStyle = slot === 0 ? COL.root : (lit ? COL.path : COL.cellEdge);
                    g.strokeRect(cx, cy, CELL_W, CELL_H);
                    g.fillStyle = COL.text;
                    g.fillText(String(s.key[slot]), cx + 3, cy + 15);
                    cx += CELL_W + GAP;
                }
                start += count;
                level++;
            }
        },
    },

    // Fenwick: the flat 1-based _t array; the update climb (k += k & -k) from the
    // last target lights the ~log2(n) cells one per level.
    Fenwick: {
        fields: ['n', 't', 'path', 'pathLen', 'target'],
        model(s) { return pick(s, this.fields); },
        draw(g, s, geom) {
            const x0 = geom.x, y0 = geom.y + 18;
            g.fillStyle = COL.label;
            g.font = '11px ui-monospace, monospace';
            g.fillText('BIT _t[1..' + s.n + '] -- climb i&-i from ' + s.target + ' lit', x0, geom.y + 12);
            const perRow = Math.max(1, Math.floor(geom.w / (CELL_W + GAP)));
            for (let k = 1; k <= s.n; k++) {
                const idx = k - 1;
                const cx = x0 + (idx % perRow) * (CELL_W + GAP);
                const cy = y0 + Math.floor(idx / perRow) * (CELL_H + GAP);
                const lit = onPath(s.path, s.pathLen, k);
                g.fillStyle = lit ? COL.pathFill : COL.cell;
                g.fillRect(cx, cy, CELL_W, CELL_H);
                g.lineWidth = lit ? 2 : 1;
                g.strokeStyle = lit ? COL.path : COL.cellEdge;
                g.strokeRect(cx, cy, CELL_W, CELL_H);
                g.fillStyle = COL.text;
                g.fillText(String(s.t[k]), cx + 3, cy + 15);
            }
        },
    },

    // SegmentTree: the flat _t[1..2n-1] tree (index 0 unused); the update climb from
    // leaf n+i to the root lights the fold spine, one node per level.
    SegmentTree: {
        fields: ['n', 'kind', 't', 'path', 'pathLen', 'target'],
        model(s) { return pick(s, this.fields); },
        draw(g, s, geom) {
            const x0 = geom.x, y0 = geom.y + 18, w = geom.w;
            const kindName = s.kind === 0 ? 'min' : s.kind === 1 ? 'max' : s.kind === 2 ? 'sum' : 'gcd';
            g.fillStyle = COL.label;
            g.font = '11px ui-monospace, monospace';
            g.fillText('segtree(' + kindName + ') _t[1..' + (2 * s.n - 1) + '] -- fold spine lit',
                x0, geom.y + 12);
            // Draw internal + leaf levels: node p sits at depth floor(log2 p).
            const maxIndex = 2 * s.n - 1;
            let level = 0, start = 1;
            while (start <= maxIndex) {
                const count = 1 << level;
                const rowN = Math.min(count, maxIndex - start + 1);
                const rowW = rowN * (CELL_W + GAP);
                let cx = x0 + Math.max(0, (w - rowW) / 2);
                const cy = y0 + level * (CELL_H + 14);
                for (let j = 0; j < rowN; j++) {
                    const p = start + j;
                    const lit = onPath(s.path, s.pathLen, p);
                    g.fillStyle = lit ? COL.pathFill : COL.cell;
                    g.fillRect(cx, cy, CELL_W, CELL_H);
                    g.lineWidth = lit ? 2 : 1;
                    g.strokeStyle = p === 1 ? COL.root : (lit ? COL.path : COL.cellEdge);
                    g.strokeRect(cx, cy, CELL_W, CELL_H);
                    g.fillStyle = COL.text;
                    g.fillText(String(s.t[p]), cx + 3, cy + 15);
                    cx += CELL_W + GAP;
                }
                start += count;
                level++;
            }
        },
    },

    // SkipList: express lanes drawn bottom-up; each node's tower height is read from
    // the snapshot; the descending search path lights the drop nodes per level. The
    // pool conservation (activeSlots + freeListLength) is printed as the honesty line.
    SkipList: {
        fields: ['n', 'level', 'maxLevel', 'slot', 'key', 'val', 'height',
            'drop', 'dropLen', 'target', 'activeSlots', 'freeListLength'],
        model(s) { return pick(s, this.fields); },
        draw(g, s, geom) {
            const x0 = geom.x, y0 = geom.y + 20;
            g.fillStyle = COL.label;
            g.font = '11px ui-monospace, monospace';
            g.fillText('skiplist (' + s.n + ') level ' + s.level + '/' + s.maxLevel +
                ' -- descent for key ' + s.target + ' lit', x0, geom.y + 12);
            const laneH = CELL_H + 6;
            // drop[] is indexed from the TOP level down: dropLen == current level,
            // entry d for descent-step di corresponds to level (level-1-di).
            for (let lvl = s.level - 1; lvl >= 0; lvl--) {
                const di = (s.level - 1) - lvl;
                const dropOrder = di < s.dropLen ? s.drop[di] : -2;
                const cy = y0 + ((s.level - 1) - lvl) * laneH;
                g.fillStyle = COL.dim;
                g.fillText('L' + lvl, x0, cy + 15);
                let cx = x0 + 26;
                for (let i = 0; i < s.n; i++) {
                    if (s.height[i] <= lvl) { cx += CELL_W + GAP; continue; }
                    const lit = i === dropOrder;
                    g.fillStyle = lit ? COL.pathFill : COL.node;
                    g.fillRect(cx, cy, CELL_W, CELL_H);
                    g.lineWidth = lit ? 2 : 1;
                    g.strokeStyle = lit ? COL.path : COL.express;
                    g.strokeRect(cx, cy, CELL_W, CELL_H);
                    g.fillStyle = COL.text;
                    g.fillText(String(s.key[i]), cx + 3, cy + 15);
                    cx += CELL_W + GAP;
                }
            }
            const cons = s.activeSlots + s.freeListLength;
            g.fillStyle = COL.dim;
            g.fillText('pool active ' + s.activeSlots + ' + free ' + s.freeListLength +
                ' = ' + cons + ' (conserved)', x0, y0 + s.level * laneH + 12);
        },
    },
};

/** The members this module renders. Demo.test.mjs asserts this covers every engine
 *  member (no member silently unrendered). */
export const RENDERED_MEMBERS = Object.keys(RENDERERS);
