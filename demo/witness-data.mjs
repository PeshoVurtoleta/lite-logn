// @zakkster/lite-logn -- demo Truth-Panel witness bands (repo-only dev artifact, NEVER shipped).
//
// A STATIC, browser-importable copy of the GATED slope bands the `npm run witness` gate proves,
// one entry per demo member. test/witness.mjs (the source of truth) cannot be imported in a
// browser -- it pulls in node: modules -- so this is a hand-copied table of its exported
// constants (BINARYHEAP_SLOPE_LO/HI, FENWICK_UPDATE_SLOPE_*, ... MST_COUNTLE_SLOPE_*). It is
// kept honest by a fail-closed drift test in Demo.test.mjs that imports BOTH this module and
// test/witness.mjs's MEMBERS registry and asserts every value here equals the registry (so a
// witness recalibration that forgets this file FAILS the demo suite, never drifts silently).
//
// Each entry: the member's GATED op, its fit AXIS ('log2(n)' or '(log2 n)^2'), and the gated
// slope band [lo, hi] in ns per axis-level (the 0.6x..1.4x envelope around the calibration
// median). For members with two gated ops (Fenwick, SegmentTree, SkipList, Fenwick2D,
// SegmentTree2D) the op the scene animates is listed. ASCII-only per suite law.

// The shared R^2 floor every witness fit must clear (BINARYHEAP_R2_FLOOR in test/witness.mjs).
export const R2_FLOOR = 0.958;

export const WITNESS_BANDS = {
    BinaryHeap:        { op: 'pop',     axis: 'log2(n)',    lo: 5.76,  hi: 13.44 },
    MinMaxHeap:        { op: 'popMin',  axis: 'log2(n)',    lo: 6.18,  hi: 14.42 },
    BinomialHeap:      { op: 'popMin',  axis: 'log2(n)',    lo: 26.89, hi: 62.75 },
    PairingHeap:       { op: 'popMin',  axis: 'log2(n)',    lo: 13.08, hi: 30.52 },
    FibonacciHeap:     { op: 'popMin',  axis: 'log2(n)',    lo: 27.18, hi: 63.41 },
    SkipList:          { op: 'get',     axis: 'log2(n)',    lo: 5.27,  hi: 12.30 },
    Treap:             { op: 'get',     axis: 'log2(n)',    lo: 2.55,  hi: 5.95 },
    Scapegoat:         { op: 'get',     axis: 'log2(n)',    lo: 2.41,  hi: 5.63 },
    SplayTree:         { op: 'get',     axis: 'log2(n)',    lo: 16.39, hi: 38.24 },
    SortedArray:       { op: 'get',     axis: 'log2(n)',    lo: 0.59,  hi: 1.38 },
    Fenwick:           { op: 'update',  axis: 'log2(n)',    lo: 1.84,  hi: 4.30 },
    SegmentTree:       { op: 'query',   axis: 'log2(n)',    lo: 4.30,  hi: 10.04 },
    Fenwick2D:         { op: 'rectSum', axis: '(log2 n)^2', lo: 2.90,  hi: 6.77 },
    SegmentTree2D:     { op: 'query',   axis: '(log2 n)^2', lo: 3.06,  hi: 7.15 },
    PersistentSegTree: { op: 'query',   axis: 'log2(n)',    lo: 9.53,  hi: 22.23 },
    MergeSortTree:     { op: 'countLE', axis: '(log2 n)^2', lo: 3.13,  hi: 7.31 },
};
