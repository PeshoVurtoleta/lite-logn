/**
 * @zakkster/lite-logn -- torture gate.
 *
 *     node --expose-gc test/torture.mjs
 *
 * Two jobs, kept separate (torture-harness skill):
 *   - @zakkster/lite-leak       -- retention: does a member instance outlive its
 *                                  owner? tracker.size() -> 0 is the proof.
 *   - @zakkster/lite-gc-profiler -- budget: does V8 collect where it must not,
 *                                   and does the hot path allocate? 0 B/op,
 *                                   maxMajor 0, maxPauseMs <= 2 is the gate.
 *
 * v0.1.0 ships BinaryHeap; v0.2.0 adds Fenwick; v0.3.0 adds SegmentTree; v0.4.0
 * adds SkipList. Phase 1 (retention) tracks a fresh heap, Fenwick, SegmentTree AND
 * SkipList per churn cycle -- the cleanup closes over NOTHING (the held-value
 * contract), so all four finalize and tracker.size() returns to 0. Phase 2 steps a
 * single out-of-loop heap (push / pop / changeKey / remove), Fenwick (update /
 * prefix / at / rangeSum / set / forEach), SegmentTree (update / query / at /
 * forEach) and SkipList (get / set / delete / successor / rangeIter) and gates
 * 0 B/op via measureAllocs -- a deliberately-allocating CONTROL lane must report
 * > 0 bytes, proving the instrument has teeth. It then profiles a steady churn
 * window mixing all four members for gc major = 0, asserts the backing arrayBuffers
 * do not grow across fill/clear cycles for any member, and asserts the SkipList's
 * private free-list conservation invariant (activeSlots + freeListLength ===
 * capacity) after every soak cycle.
 * Never widen a budget to make this pass -- a budget that moves is not a gate.
 *
 * ENTRY CONTRACT: --expose-gc is mandatory (the GC gate is meaningless without
 * it); the devDeps are imported AFTER the guard so a fresh clone that skipped
 * `npm install` fails with a remedy, not a stack trace.
 */

// Module-scope release: closes over NOTHING (no reference to any tracked heap),
// so it never defeats finalization -- the held-value contract (torture-harness).
function noopRelease() {}

async function main() {
    if (typeof globalThis.gc !== 'function') {
        process.stderr.write(
            'torture: FAIL -- run with --expose-gc: node --expose-gc test/torture.mjs\n');
        process.exit(1);
    }
    for (const pkg of ['@zakkster/lite-gc-profiler', '@zakkster/lite-leak']) {
        try {
            await import(pkg);
        } catch {
            process.stderr.write(
                'torture: FAIL -- missing devDependency ' + pkg + ' -- run: npm install\n');
            process.exit(2);
        }
    }

    const { GcProfiler, checkNoGc, measureAllocs } =
        await import('@zakkster/lite-gc-profiler');
    const { createLeakTracker } = await import('@zakkster/lite-leak');
    // >>> WIRE: the members under test.
    const { VERSION, BinaryHeap, Fenwick, SegmentTree, SkipList, Treap, Scapegoat, MinMaxHeap, SplayTree, BinomialHeap, PairingHeap, FibonacciHeap, Fenwick2D, SegmentTree2D, SortedArray, PersistentSegTree, MergeSortTree, WaveletTree, CartesianTree, LinkCutTree } = await import('../LogN.js');

    const CYCLES = 4096;    // retention churn
    const HOT = 2000000;    // steady-state ops
    const CAP = 4096;       // hot-path heap capacity
    const MASK = CAP - 1;   // id & MASK is always in [0, CAP)

    const leaks = [];
    const warns = [];
    const tracker = createLeakTracker({
        name: 'lite-logn',
        onWarning: (w) => warns.push(w.kind + ':' + w.reason),
    });
    // No onLeak, no kernels: a BinaryHeap owns only its three typed arrays (no
    // timer, listener, observer, or DOM node), so being collected is the DESIRED
    // outcome, not a resource orphan. The retention proof is finalization itself
    // -- tracker.size() returning to 0 means every tracked heap was reclaimed.

    // ---- phase 1: retention torture ---------------------------------------
    // A fresh BinaryHeap per cycle, exercised then dropped. The cleanup closes
    // over NOTHING (a no-op: a heap owns only its typed arrays, no external
    // resource), and the tag is a primitive -- neither captures the tracked heap,
    // so finalization is not defeated. tracker.size() -> 0 is the retention proof.
    function fillTracker() {
        for (let i = 0; i < CYCLES; i++) {
            const heap = new BinaryHeap(64, (i & 1) ? 'max' : 'min');
            for (let k = 0; k < 32; k++) heap.push(k, (k * 2654435761) & 0xffff);
            heap.changeKey(0, 7);
            heap.pop();
            heap.remove(5);
            tracker.track(heap, noopRelease, i, { audit: true });
            // A fresh Fenwick per cycle, exercised then dropped. Same held-value
            // contract: a Fenwick owns only its one Float64Array, no external
            // resource, so the no-op cleanup never defeats finalization.
            const fen = new Fenwick(64);
            for (let k = 0; k < 64; k++) fen.update(k, (k * 2654435761) & 0xffff);
            fen.set(0, 7);
            fen.prefix(63);
            fen.rangeSum(1, 40);
            tracker.track(fen, noopRelease, CYCLES + i, { audit: true });
            // A fresh SegmentTree per cycle, exercised then dropped. Same held-
            // value contract: a SegmentTree owns only its one Float64Array, no
            // external resource, so the no-op cleanup never defeats finalization.
            const seg = new SegmentTree(64, (i & 1) ? 'min' : 'sum');
            for (let k = 0; k < 64; k++) seg.update(k, (k * 2654435761) & 0xffff);
            seg.query(0, 63);
            seg.query(10, 40);
            seg.at(7);
            tracker.track(seg, noopRelease, 2 * CYCLES + i, { audit: true });
            // A fresh SkipList per cycle, exercised then dropped. Same held-value
            // contract: a SkipList owns only its typed arrays + a private NodePool
            // (no external resource), so the no-op cleanup never defeats finalization.
            const sl = new SkipList(64, (i & 0xffff) >>> 0);
            for (let k = 0; k < 32; k++) sl.set((k * 2654435761) & 63, k);
            sl.get(7);
            sl.successor(3);
            sl.delete(5);
            tracker.track(sl, noopRelease, 3 * CYCLES + i, { audit: true });
            // A fresh Treap per cycle, exercised then dropped. Same held-value
            // contract: a Treap owns only its six typed arrays + a private NodePool
            // (no external resource), so the no-op cleanup never defeats finalization.
            const tr = new Treap(64, (i & 0xffff) >>> 0);
            for (let k = 0; k < 32; k++) tr.set((k * 2654435761) & 63, k);
            tr.get(7);
            tr.rank(20);
            tr.select(3);
            tr.successor(3);
            tr.delete(5);
            tracker.track(tr, noopRelease, 4 * CYCLES + i, { audit: true });
            // A fresh Scapegoat per cycle, exercised (incl. rebuild-forcing ascending
            // inserts) then dropped. Same held-value contract: a Scapegoat owns only its
            // typed-array columns + a private NodePool + two rebuild scratch buffers (no
            // external resource), so the no-op cleanup never defeats finalization.
            const sc = new Scapegoat(64);
            for (let k = 0; k < 40; k++) sc.set(k, k); // ascending -> forces rebuilds
            sc.get(7);
            sc.rank(20);
            sc.select(3);
            sc.successor(3);
            sc.delete(5);
            tracker.track(sc, noopRelease, 5 * CYCLES + i, { audit: true });
            // A fresh MinMaxHeap per cycle, exercised (both ends) then dropped. Same held-
            // value contract: a MinMaxHeap owns only its two typed arrays (no external
            // resource), so the no-op cleanup never defeats finalization.
            const mmh = new MinMaxHeap(64);
            for (let k = 0; k < 40; k++) mmh.push(k & 63, (k * 2654435761) & 0xffff);
            mmh.popMin();
            mmh.popMax();
            mmh.peekMin();
            mmh.peekMax();
            tracker.track(mmh, noopRelease, 6 * CYCLES + i, { audit: true });
            // A fresh SplayTree per cycle, exercised (reads SPLAY -> restructure) then
            // dropped. Same held-value contract: a SplayTree owns only its four typed-array
            // columns + a private NodePool (no external resource), so the no-op cleanup never
            // defeats finalization.
            const sp = new SplayTree(64);
            for (let k = 0; k < 32; k++) sp.set((k * 2654435761) & 63, k);
            sp.get(7);        // a read that splays
            sp.has(3);
            sp.successor(3);
            sp.delete(5);
            tracker.track(sp, noopRelease, 7 * CYCLES + i, { audit: true });
            // A fresh BinomialHeap ARENA per cycle (two arena-sharing heaps melded then drained),
            // then dropped. Same held-value contract: a BinomialHeap owns only its six typed-array
            // columns + a private NodePool (no external resource), so the no-op cleanup never
            // defeats finalization -- and melding one sibling into the other keeps both alive to be
            // reclaimed together (the arena is one graph of typed arrays).
            const [bha, bhb] = BinomialHeap.arena(64, (i & 1) ? 'max' : 'min', 2);
            for (let k = 0; k < 20; k++) bha.push(k & 63, (k * 2654435761) & 0xffff);
            for (let k = 0; k < 20; k++) bhb.push((k + 20) & 63, (k * 40503) & 0xffff);
            bha.meld(bhb);    // consumes bhb; its nodes move into bha's root list
            bha.popMin();
            bha.peekMin();
            tracker.track(bha, noopRelease, 8 * CYCLES + i, { audit: true });
            // A fresh PairingHeap ARENA per cycle (two arena-sharing heaps melded, decreaseKey'd,
            // removed, then drained), dropped. Same held-value contract: a PairingHeap owns only its
            // typed-array columns + arena-wide maps + a private NodePool (no external resource), so
            // the no-op cleanup never defeats finalization -- and the O(1) meld keeps both alive to
            // be reclaimed together (the arena is one graph of typed arrays).
            const [pha, phb] = PairingHeap.arena(64, (i & 1) ? 'max' : 'min', 2);
            for (let k = 0; k < 20; k++) pha.push(k, (k * 2654435761) & 0xffff);
            for (let k = 20; k < 40; k++) phb.push(k, (k * 40503) & 0xffff);
            pha.meld(phb);    // consumes phb; O(1) root-link
            pha.decreaseKey(30, (i & 1) ? 0x1ffff : -5); // reprioritize a melded-in id toward the extreme
            pha.remove(10);
            pha.popMin();
            pha.peekMin();
            tracker.track(pha, noopRelease, 9 * CYCLES + i, { audit: true });
            // A fresh FibonacciHeap ARENA per cycle (two arena-sharing heaps melded, decreaseKey'd,
            // removed, then drained), dropped. Same held-value contract: a FibonacciHeap owns only
            // its typed-array columns + arena-wide maps + degree-bucket scratch + a private NodePool
            // (no external resource), so the no-op cleanup never defeats finalization -- and the
            // O(1) meld keeps both alive to be reclaimed together (the arena is one graph of arrays).
            const [fha, fhb] = FibonacciHeap.arena(64, (i & 1) ? 'max' : 'min', 2);
            for (let k = 0; k < 20; k++) fha.push(k, (k * 2654435761) & 0xffff);
            for (let k = 20; k < 40; k++) fhb.push(k, (k * 40503) & 0xffff);
            fha.meld(fhb);    // consumes fhb; O(1) circular-list concat
            fha.decreaseKey(30, (i & 1) ? 0x1ffff : -5); // reprioritize a melded-in id toward the extreme
            fha.remove(10);
            fha.popMin();
            fha.peekMin();
            tracker.track(fha, noopRelease, 10 * CYCLES + i, { audit: true });
            // A fresh Fenwick2D per cycle, exercised then dropped. Same held-value
            // contract: a Fenwick2D owns only its one Float64Array, no external
            // resource, so the no-op cleanup never defeats finalization.
            const f2 = new Fenwick2D(16, 16);
            for (let r = 0; r < 16; r++) for (let c = 0; c < 16; c++) f2.update(r, c, (r * 16 + c) & 0xff);
            f2.set(0, 0, 7);
            f2.prefix(15, 15);
            f2.rectSum(1, 1, 10, 10);
            f2.at(7, 7);
            tracker.track(f2, noopRelease, 11 * CYCLES + i, { audit: true });
            // A fresh SegmentTree2D per cycle, exercised then dropped. Same held-value
            // contract: a SegmentTree2D owns only its one Float64Array, no external
            // resource, so the no-op cleanup never defeats finalization.
            const st2 = new SegmentTree2D(16, 16, (i & 1) ? 'min' : 'sum');
            for (let r = 0; r < 16; r++) for (let c = 0; c < 16; c++) st2.update(r, c, (r * 16 + c) & 0xff);
            st2.query(1, 1, 10, 10);
            st2.at(7, 7);
            tracker.track(st2, noopRelease, 12 * CYCLES + i, { audit: true });
            // A fresh SortedArray per cycle, exercised (scattered inserts -> shift-heavy, a
            // delete, reads) then dropped. Same held-value contract: a SortedArray owns only its
            // two Float64Arrays (no external resource), so the no-op cleanup never defeats
            // finalization.
            const sa = new SortedArray(64);
            for (let k = 0; k < 40; k++) sa.set((k * 2654435761) & 63, k); // scattered -> tail shifts
            sa.get(7);
            sa.rank(20);
            sa.select(3);
            sa.successor(3);
            sa.delete(5);
            tracker.track(sa, noopRelease, 13 * CYCLES + i, { audit: true });
            // A fresh PersistentSegTree per cycle, exercised (a chain of path-copying updates that
            // branch off older versions, plus range/point reads) then dropped. Same held-value
            // contract: a PersistentSegTree owns only its three node columns + a _roots typed array
            // (no external resource), so the no-op cleanup never defeats finalization.
            const pst = new PersistentSegTree(64, 40, (i & 1) ? 'min' : 'sum');
            let pv = 0;
            for (let k = 0; k < 40; k++) pv = pst.update((k & 3) ? pv : 0, (k * 2654435761) & 63, (k * 40503) & 0xffff);
            pst.query(pv, 0, 63);
            pst.query(0, 10, 40);   // an OLD version stays queryable
            pst.at(pv, 7);
            tracker.track(pst, noopRelease, 14 * CYCLES + i, { audit: true });
            // A fresh MergeSortTree per cycle, built from a scratch array of values then exercised
            // (range-rank reads over index + value windows) then dropped. Same held-value contract: a
            // MergeSortTree owns only its flat _t Float64Array run table (no external resource), and it
            // is IMMUTABLE (no mutators), so the no-op cleanup never defeats finalization.
            const mstVals = new Float64Array(64);
            for (let k = 0; k < 64; k++) mstVals[k] = (k * 2654435761) & 0xffff;
            const mst = MergeSortTree.build(mstVals);
            mst.countLE(0, 63, i & 0xffff);
            mst.countLE(10, 40, (i * 40503) & 0xffff);
            mst.rangeCount(0, 63, 100, 5000);
            tracker.track(mst, noopRelease, 15 * CYCLES + i, { audit: true });
            // A fresh WaveletTree per cycle, built from a scratch array of coordinate-compressed values
            // then exercised across the full surface (access / rank / select / quantile / rangeCount)
            // then dropped. Same held-value contract: a WaveletTree owns only its flat _words / _blk /
            // _Z / _remap typed arrays (no external resource), and it is IMMUTABLE (no mutators), so the
            // no-op cleanup never defeats finalization.
            const wtVals = new Float64Array(64);
            for (let k = 0; k < 64; k++) wtVals[k] = (k * 2654435761) & 0x3f;
            const wt = WaveletTree.build(wtVals);
            wt.access(i & 63);
            wt.rank(i & 0x3f, 64);
            wt.select(i & 0x3f, 0);
            wt.quantile(0, 63, i & 63);
            wt.rangeCount(0, 63, 0, i & 0x3f);
            tracker.track(wt, noopRelease, 16 * CYCLES + i, { audit: true });
            // A fresh CartesianTree per cycle, built from a scratch array of values then exercised across
            // its read surface (rangeMinIndex / rangeMin / at / parent / depth) then dropped. Same held-
            // value contract: a CartesianTree owns only its flat _val / _left / _right / _parent / _depth /
            // _up typed arrays (no external resource), and it is IMMUTABLE (no mutators), so the no-op
            // cleanup never defeats finalization.
            const ctVals = new Float64Array(64);
            for (let k = 0; k < 64; k++) ctVals[k] = (k * 2654435761) & 0xffff;
            const ct = CartesianTree.build(ctVals, (i & 1) ? 'min' : 'max');
            ct.rangeMinIndex(0, 63);
            ct.rangeMin(10, 40);
            ct.at(i & 63);
            ct.parent(i & 63);
            ct.depth(i & 63);
            tracker.track(ct, noopRelease, 17 * CYCLES + i, { audit: true });
            // A fresh LinkCutTree per cycle: build a small forest (link a chain + a star), churn it
            // (evert / cut / re-link / path folds) then drop it. Same held-value contract: a LinkCutTree
            // owns only its eight pointer-free typed-array columns + a scratch stack (no external
            // resource, no free-list of objects), so the no-op cleanup never defeats finalization.
            const lct = new LinkCutTree(64, (i & 1) ? 'max' : 'sum');
            for (let k = 0; k < 64; k++) lct.setValue(k, (k * 2654435761) & 0xffff);
            for (let k = 1; k < 32; k++) lct.link(k, k - 1);         // a chain 0..31
            for (let k = 32; k < 64; k++) lct.link(k, 0);           // a star of leaves on 0
            lct.evert(20);
            lct.pathAggregate(5, 25);
            lct.pathAggregate(40);
            lct.findRoot(50);
            lct.connected(10, 60);
            lct.cut(15);
            lct.link(15, 3);
            tracker.track(lct, noopRelease, 18 * CYCLES + i, { audit: true });
        }
        return tracker.size();
    }
    fillTracker();

    // Drain: FinalizationRegistry callbacks run on their own task. Loop gc + a
    // macrotask turn until the tracker empties (bounded, so a genuine retention
    // still fails). At v0.1.0 it is already empty.
    let live = tracker.size();
    for (let g = 0; g < 20 && live > 0; g++) {
        globalThis.gc();
        await new Promise((r) => setTimeout(r, 25));
        live = tracker.size();
    }
    const findings = tracker.audit();

    // ---- phase 2a: per-call allocation on the hot path (0 B/op) ------------
    // A single out-of-loop heap prefilled to capacity. Each measured lane is a
    // real hot op (or a size-preserving pair) that MUST allocate zero bytes.
    const inst = new BinaryHeap(CAP, 'min');
    for (let i = 0; i < CAP; i++) inst.push(i, (i * 2654435761) & 0xffff);

    let tk = (VERSION.length | 0);
    // push/pop churn: pop the extremum, push that id back -> steady full heap.
    const stepPushPop = () => {
        const id = inst.pop();
        inst.push(id, (tk * 2654435761) & 0xffff);
        tk = (tk + 1) | 0;
    };
    // changeKey: reprioritize a resident id (heap stays full) -> auto-direction sift.
    const stepChangeKey = () => {
        inst.changeKey(tk & MASK, (tk * 40503) & 0xffff);
        tk = (tk + 1) | 0;
    };
    // remove + push back: addressable delete then re-insert -> steady full heap.
    const stepRemove = () => {
        const id = tk & MASK;
        if (inst.remove(id)) inst.push(id, (tk * 2246822519) & 0xffff);
        tk = (tk + 1) | 0;
    };
    // read mix: peek / topKey / keyOf / has folded into an int accumulator.
    let racc = 0;
    const stepRead = () => {
        const id = tk & MASK;
        racc = (racc + inst.peek() + inst.topKey() + inst.keyOf(id) + (inst.has(id) ? 1 : 0)) | 0;
        tk = (tk + 1) | 0;
    };

    // Fenwick: one out-of-loop tree prefilled to capacity. Each lane is a real
    // hot op (or a size-preserving pair) that MUST allocate zero bytes.
    const fen = new Fenwick(CAP);
    for (let i = 0; i < CAP; i++) fen.update(i, (i * 2654435761) & 0xffff);

    let fk = 0;
    // update: climb by i & -i, one _t touch per level. Balanced +/- so the tree
    // never drifts to +-Infinity over 100k*8 iterations.
    const stepUpdate = () => {
        const i = fk & MASK;
        fen.update(i, (fk & 1) ? 1 : -1);
        fk = (fk + 1) | 0;
    };
    // prefix: descend by i & -i, folded into an accumulator.
    let facc = 0;
    const stepPrefix = () => {
        facc = (facc + fen.prefix(fk & MASK)) | 0;
        fk = (fk + 1) | 0;
    };
    // at: prefix(i) - prefix(i-1), two walks, folded into the accumulator.
    const stepAt = () => {
        facc = (facc + fen.at(fk & MASK)) | 0;
        fk = (fk + 1) | 0;
    };
    // rangeSum: two prefix walks over a fixed-width window, folded in.
    const stepRangeSum = () => {
        const lo = fk & (MASK >> 1);
        facc = (facc + fen.rangeSum(lo, lo + 100)) | 0;
        fk = (fk + 1) | 0;
    };
    // set: read-then-climb to an ABSOLUTE bounded value (0..0xffff), one shared
    // validation, two walks (the internal at-read then the update climb). Zero
    // allocation; the value is bounded so no drift risk over the batch.
    const stepSet = () => {
        fen.set(fk & MASK, fk & 0xffff);
        fk = (fk + 1) | 0;
    };
    // forEach: the O(n log n) ascending cold scan, driven through a HOISTED
    // callback that closes over nothing but the shared accumulator below -- no
    // per-call closure allocation. Every element re-derives its value via the
    // same two-walk `at` trick forEach uses internally.
    let feAcc = 0;
    function forEachCb(value, index) { feAcc = (feAcc + value + index) | 0; }
    const stepForEach = () => { fen.forEach(forEachCb); };

    // SegmentTree: one out-of-loop tree prefilled to capacity (sum fold). Each
    // lane is a real hot op that MUST allocate zero bytes.
    const seg = new SegmentTree(CAP, 'sum');
    for (let i = 0; i < CAP; i++) seg.update(i, (i * 2654435761) & 0xffff);

    let sk = 0;
    // update: set an ABSOLUTE bounded leaf value, then fix ancestors -- one write
    // per level. Bounded value so the tree never drifts to +-Infinity.
    const stepSegUpdate = () => {
        seg.update(sk & MASK, sk & 0xffff);
        sk = (sk + 1) | 0;
    };
    // query: fold a fixed-width window (two boundary walks), folded into an accumulator.
    let sacc = 0;
    const stepSegQuery = () => {
        const lo = sk & (MASK >> 1);
        sacc = (sacc + (seg.query(lo, lo + 100) | 0)) | 0;
        sk = (sk + 1) | 0;
    };
    // at: read a single leaf, folded into the accumulator.
    const stepSegAt = () => {
        sacc = (sacc + (seg.at(sk & MASK) | 0)) | 0;
        sk = (sk + 1) | 0;
    };
    // forEach: the O(n) ascending cold scan through a HOISTED callback that closes
    // over nothing but the shared accumulator -- no per-call closure allocation.
    let sfeAcc = 0;
    function segForEachCb(value, index) { sfeAcc = (sfeAcc + value + index) | 0; }
    const stepSegForEach = () => { seg.forEach(segForEachCb); };

    // SkipList: one out-of-loop list prefilled to half capacity (a warmed, stable
    // tower). Each lane is a real hot op that MUST allocate zero RETAINED bytes --
    // links are slot INDICES from a private free-list, never heap objects, and the
    // rangeIter generator's per-step {value, done} objects are TRANSIENT (consumed
    // and dropped), so retained growth is 0.
    const HALF = CAP >> 1;              // keys 0..HALF-1 resident; MASK>>1 stays in range
    const HMASK = HALF - 1;
    const sl = new SkipList(CAP, 0x9E3779B9);
    for (let i = 0; i < HALF; i++) sl.set(i, (i * 2654435761) & 0xffff);

    let lk = 0, lacc = 0;
    // get: a hit on a resident cycling key, folded into an accumulator.
    const stepSlGet = () => {
        lacc = (lacc + (sl.get(lk & HMASK) | 0)) | 0;
        lk = (lk + 1) | 0;
    };
    // set: an in-place value update of a resident key (no new node) -- the pure
    // set hot path, zero allocation.
    const stepSlSet = () => {
        sl.set(lk & HMASK, lk & 0xffff);
        lk = (lk + 1) | 0;
    };
    // delete + re-set: addressable delete then re-insert of the SAME key -> steady
    // size, exercising the private free-list alloc/free (a slot INDEX, no heap object).
    const stepSlDelete = () => {
        const key = lk & HMASK;
        if (sl.delete(key)) sl.set(key, (lk * 2246822519) & 0xffff);
        lk = (lk + 1) | 0;
    };
    // successor: a strictly-greater lookup on a cycling key, folded in.
    const stepSlSuccessor = () => {
        const v = sl.successor(lk & HMASK);
        lacc = (lacc + (v === undefined ? 0 : v | 0)) | 0;
        lk = (lk + 1) | 0;
    };
    // rangeIter: fully consume a small fixed-width window; the generator is
    // transient (dropped each call), so retained growth is 0.
    const stepSlRangeIter = () => {
        const lo = lk & (HMASK >> 1);
        for (const key of sl.rangeIter(lo, lo + 8)) lacc = (lacc + (key | 0)) | 0;
        lk = (lk + 1) | 0;
    };

    // Treap: one out-of-loop tree prefilled to half capacity (a warmed, stable tree).
    // Each lane is a real hot op that MUST allocate zero RETAINED bytes -- links are
    // slot INDICES from a private free-list, never heap objects, the recursive
    // set/delete/merge run on the native call stack, and the rangeIter generator's
    // per-step {value, done} objects are TRANSIENT, so retained growth is 0.
    const tr = new Treap(CAP, 0x9E3779B9);
    for (let i = 0; i < HALF; i++) tr.set(i, (i * 2654435761) & 0xffff);

    let trk = 0, tracc = 0;
    // get: a hit on a resident cycling key, folded into an accumulator.
    const stepTrGet = () => {
        tracc = (tracc + (tr.get(trk & HMASK) | 0)) | 0;
        trk = (trk + 1) | 0;
    };
    // set: an in-place value update of a resident key (no new node) -- zero allocation.
    const stepTrSet = () => {
        tr.set(trk & HMASK, trk & 0xffff);
        trk = (trk + 1) | 0;
    };
    // delete + re-set: addressable delete then re-insert of the SAME key -> steady
    // size, exercising the free-list free/alloc + recursive merge/insert (call stack).
    const stepTrDelete = () => {
        const key = trk & HMASK;
        if (tr.delete(key)) tr.set(key, (trk * 2246822519) & 0xffff);
        trk = (trk + 1) | 0;
    };
    // rank / select: order-statistic descents over subtree counts, folded in.
    const stepTrRankSelect = () => {
        tracc = (tracc + (tr.rank(trk & HMASK) | 0)) | 0;
        const v = tr.select(trk & (HMASK >> 1));
        tracc = (tracc + (v === undefined ? 0 : v | 0)) | 0;
        trk = (trk + 1) | 0;
    };
    // successor: a strictly-greater lookup on a cycling key, folded in.
    const stepTrSuccessor = () => {
        const v = tr.successor(trk & HMASK);
        tracc = (tracc + (v === undefined ? 0 : v | 0)) | 0;
        trk = (trk + 1) | 0;
    };
    // forEach: the O(n) ascending in-order recursive walk through a HOISTED callback
    // that closes over nothing but the shared accumulator -- no per-call closure alloc.
    let trfeAcc = 0;
    function trForEachCb(key, value) { trfeAcc = (trfeAcc + (key | 0) + (value | 0)) | 0; }
    const stepTrForEach = () => { tr.forEach(trForEachCb); };
    // rangeIter: fully consume a small fixed-width window; the generator is transient
    // (dropped each call), so retained growth is 0.
    const stepTrRangeIter = () => {
        const lo = trk & (HMASK >> 1);
        for (const key of tr.rangeIter(lo, lo + 8)) tracc = (tracc + (key | 0)) | 0;
        trk = (trk + 1) | 0;
    };

    // Scapegoat: one out-of-loop tree prefilled to half capacity (a warmed, stable tree).
    // Each lane is a real hot op that MUST allocate zero RETAINED bytes -- links are slot
    // INDICES from a private free-list, never heap objects; the rebuild reuses the ONE
    // preallocated _flat + _stack scratch (never a fresh array); the recursive delete /
    // buildBalanced / forEach run on the native call stack; and the rangeIter generator's
    // per-step {value, done} objects are TRANSIENT, so retained growth is 0.
    const sc = new Scapegoat(CAP);
    for (let i = 0; i < HALF; i++) sc.set(i, (i * 2654435761) & 0xffff);

    let sck = 0, scacc = 0;
    // get: a hit on a resident cycling key, folded into an accumulator.
    const stepScGet = () => {
        scacc = (scacc + (sc.get(sck & HMASK) | 0)) | 0;
        sck = (sck + 1) | 0;
    };
    // set: an in-place value update of a resident cycling key (no new node, no rebuild) --
    // the pure set hot path, zero allocation.
    const stepScSet = () => {
        sc.set(sck & HMASK, sck & 0xffff);
        sck = (sck + 1) | 0;
    };
    // delete + re-set: addressable delete then re-insert of the SAME key -> steady size,
    // exercising the free-list free/alloc + the recursive delete/insert (call stack).
    const stepScDelete = () => {
        const key = sck & HMASK;
        if (sc.delete(key)) sc.set(key, (sck * 2246822519) & 0xffff);
        sck = (sck + 1) | 0;
    };
    // rank / select: order-statistic descents over subtree counts, folded in.
    const stepScRankSelect = () => {
        scacc = (scacc + (sc.rank(sck & HMASK) | 0)) | 0;
        const v = sc.select(sck & (HMASK >> 1));
        scacc = (scacc + (v === undefined ? 0 : v | 0)) | 0;
        sck = (sck + 1) | 0;
    };
    // successor: a strictly-greater lookup on a cycling key, folded in.
    const stepScSuccessor = () => {
        const v = sc.successor(sck & HMASK);
        scacc = (scacc + (v === undefined ? 0 : v | 0)) | 0;
        sck = (sck + 1) | 0;
    };
    // REBUILD-HEAVY trace: a dedicated small tree fed EVER-INCREASING (ascending) keys,
    // wrap-cleared when full. Ascending insertion is the pathological case that forces the
    // scapegoat subtree REBUILD (_flatten + _buildBalanced) to fire repeatedly -- the load-
    // bearing 0-B/op proof: the rebuild reuses the preallocated _flat + _stack scratch and
    // the native stack, so even a rebuild-storm allocates zero retained bytes.
    const scReb = new Scapegoat(512);
    let screbk = 0;
    const stepScRebuild = () => {
        if (scReb.size >= 511) scReb.clear();
        scReb.set(screbk, screbk & 0xffff); // ascending key -> triggers repeated rebuilds
        screbk = (screbk + 1) | 0;
    };
    // forEach: the O(n) ascending in-order recursive walk through a HOISTED callback that
    // closes over nothing but the shared accumulator -- no per-call closure alloc.
    let scfeAcc = 0;
    function scForEachCb(key, value) { scfeAcc = (scfeAcc + (key | 0) + (value | 0)) | 0; }
    const stepScForEach = () => { sc.forEach(scForEachCb); };
    // rangeIter: fully consume a small fixed-width window; the generator is transient
    // (dropped each call), so retained growth is 0.
    const stepScRangeIter = () => {
        const lo = sck & (HMASK >> 1);
        for (const key of sc.rangeIter(lo, lo + 8)) scacc = (scacc + (key | 0)) | 0;
        sck = (sck + 1) | 0;
    };

    // MinMaxHeap: one out-of-loop DEPQ prefilled to capacity. Each lane is a real hot op
    // (a size-preserving pop+push pair) that MUST allocate zero bytes -- the two typed
    // arrays are fixed at construction; the hole-punching sifts use only local scalars.
    const mmh = new MinMaxHeap(CAP);
    for (let i = 0; i < CAP; i++) mmh.push(i & 0xffff, (i * 2654435761) & 0xffff);

    let mk = (VERSION.length | 0), macc = 0;
    // push/popMin churn: pop the minimum, push a fresh id/key back -> steady full heap.
    const stepMmhPopMin = () => {
        const id = mmh.popMin();
        mmh.push(id, (mk * 2654435761) & 0xffff);
        mk = (mk + 1) | 0;
    };
    // push/popMax churn: pop the maximum, push a fresh id/key back -> steady full heap.
    const stepMmhPopMax = () => {
        const id = mmh.popMax();
        mmh.push(id, (mk * 40503) & 0xffff);
        mk = (mk + 1) | 0;
    };
    // mixed churn: pop BOTH ends then push both back -> steady full heap, both sifts hot.
    const stepMmhMixed = () => {
        const lo = mmh.popMin();
        const hi = mmh.popMax();
        mmh.push(lo, (mk * 2246822519) & 0xffff);
        mmh.push(hi, (mk * 2654435761) & 0xffff);
        mk = (mk + 1) | 0;
    };
    // read mix: peekMin / peekMax / peekMinKey / peekMaxKey folded into an accumulator.
    const stepMmhRead = () => {
        macc = (macc + mmh.peekMin() + mmh.peekMax() + (mmh.peekMinKey() | 0) + (mmh.peekMaxKey() | 0)) | 0;
        mk = (mk + 1) | 0;
    };

    // SplayTree: one out-of-loop tree prefilled to half capacity (a warmed, stable tree).
    // Each lane is a real hot op that MUST allocate zero RETAINED bytes -- links are slot
    // INDICES from a private free-list, never heap objects; the iterative top-down splay uses
    // only the fixed scratch hands (_hl/_hr) + the slot-0 header (no recursion, no stack); and
    // the rangeIter generator's per-step {value, done} objects are TRANSIENT, so retained
    // growth is 0. NOTE: get/has/successor here SPLAY (restructure) every call -- the load-
    // bearing proof that a self-adjusting READ still allocates zero bytes.
    const sp = new SplayTree(CAP);
    for (let i = 0; i < HALF; i++) sp.set(i, (i * 2654435761) & 0xffff);

    let spk = 0, spacc = 0;
    // get: a hit on a resident cycling key (SPLAYS it to the root), folded into an accumulator.
    const stepSpGet = () => {
        spacc = (spacc + (sp.get(spk & HMASK) | 0)) | 0;
        spk = (spk + 1) | 0;
    };
    // WORKING-SET lane: hammer a SMALL hot set of keys (a mask 15 window) so the splay keeps
    // them near the root -- the self-adjusting fast path. Still 0 B/op (rotations only rewrite
    // slot links). This is the access pattern a splay tree is BUILT for; it must stay alloc-free.
    const stepSpWorkingSet = () => {
        spacc = (spacc + (sp.get(spk & 15) | 0)) | 0;
        spk = (spk + 1) | 0;
    };
    // set: an in-place value update of a resident cycling key (splay + overwrite, no new node).
    const stepSpSet = () => {
        sp.set(spk & HMASK, spk & 0xffff);
        spk = (spk + 1) | 0;
    };
    // delete + re-set: addressable delete then re-insert of the SAME key -> steady size,
    // exercising the free-list free/alloc + the splay-join (no heap object).
    const stepSpDelete = () => {
        const key = spk & HMASK;
        if (sp.delete(key)) sp.set(key, (spk * 2246822519) & 0xffff);
        spk = (spk + 1) | 0;
    };
    // successor: a strictly-greater lookup on a cycling key (SPLAYS the closest node), folded in.
    const stepSpSuccessor = () => {
        const v = sp.successor(spk & HMASK);
        spacc = (spacc + (v === undefined ? 0 : v | 0)) | 0;
        spk = (spk + 1) | 0;
    };
    // forEach: the O(n log n) ascending NON-splaying in-order walk through a HOISTED callback
    // that closes over nothing but the shared accumulator -- no per-call closure alloc.
    let spfeAcc = 0;
    function spForEachCb(key, value) { spfeAcc = (spfeAcc + (key | 0) + (value | 0)) | 0; }
    const stepSpForEach = () => { sp.forEach(spForEachCb); };
    // rangeIter: fully consume a small fixed-width window (NON-splaying); the generator is
    // transient (dropped each call), so retained growth is 0.
    const stepSpRangeIter = () => {
        const lo = spk & (HMASK >> 1);
        for (const key of sp.rangeIter(lo, lo + 8)) spacc = (spacc + (key | 0)) | 0;
        spk = (spk + 1) | 0;
    };

    // BinomialHeap: one out-of-loop standalone heap prefilled to capacity (its own arena).
    // Each lane is a real hot op that MUST allocate zero bytes -- the six columns + the private
    // NodePool are fixed at construction; the binary-carry union (_unionInto, shared by push AND
    // meld), the child-list reversal + root rescan in popMin, and the forest walk all use only
    // local scalars + slot indices, never a heap object.
    const binh = new BinomialHeap(CAP, 'min');
    for (let i = 0; i < CAP; i++) binh.push(i & 0xffff, (i * 2654435761) & 0xffff);

    let bhk = (VERSION.length | 0), bhacc = 0;
    // push/popMin churn: pop the extreme, push a fresh id/key back -> steady full heap. Exercises
    // the union binary-carry (push) AND the child-reverse + remeld + root rescan (popMin).
    const stepBinhPopMin = () => {
        const id = binh.popMin();
        binh.push(id, (bhk * 2654435761) & 0xffff);
        bhk = (bhk + 1) | 0;
    };
    // read mix: peekMin / peekMinKey folded into an accumulator (O(1) cached-root reads).
    const stepBinhRead = () => {
        bhacc = (bhacc + binh.peekMin() + (binh.peekMinKey() | 0)) | 0;
        bhk = (bhk + 1) | 0;
    };

    // BinomialHeap MELD + arena-churn: a fixed two-heap arena, driven steady-state. meld CONSUMES
    // its donor (a dead-after-meld heap fails closed on reuse), so to drive the meld hot body
    // REPEATEDLY without allocating a fresh donor each call, the donor is REFRESHED in place
    // (white-box scalar resets -- this torture gate is already white-box over _pool internals) and
    // then reloaded. The measured body is the public meld() carry (_unionInto) + the drain, which
    // MUST allocate zero bytes -- the carry is byte-identical to push's, and no ctor runs in the
    // lane, so a non-zero reading here would be a real regression, not the refresh.
    const [accB, donorB] = BinomialHeap.arena(CAP, 'min', 2);
    let mbk = 0;
    const stepBinhMeld = () => {
        // refresh the (consumed) donor in place -- alloc-free, so measureAllocs reads the carry.
        donorB._consumed = false; donorB._head = 0; donorB._min = 0; donorB._n = 0;
        for (let k = 0; k < 8; k++) donorB.push((mbk + k) & 0xffff, ((mbk + k) * 40503) & 0xffff);
        accB.meld(donorB);              // consumes donorB; its 8 nodes move into accB (0-alloc carry)
        for (let k = 0; k < 8; k++) bhacc = (bhacc + accB.popMin()) | 0; // drain back -> steady empty accB
        mbk = (mbk + 8) | 0;
    };

    // forEach: the O(n) forest walk through a HOISTED callback that closes over nothing but the
    // shared accumulator -- no per-call closure alloc.
    let bhfeAcc = 0;
    function bhForEachCb(id, key) { bhfeAcc = (bhfeAcc + (id | 0) + (key | 0)) | 0; }
    const stepBinhForEach = () => { binh.forEach(bhForEachCb); };

    // PairingHeap: one out-of-loop standalone heap prefilled to capacity (its own arena). Each lane
    // is a real hot op that MUST allocate zero bytes -- the five columns + arena-wide _pos/_owner
    // maps + union-find alias + private NodePool are fixed at construction; the two-pass combine
    // (popMin), the O(1) cut (decreaseKey/remove), and the O(1) meld all rewrite slot links only,
    // never a heap object. ids are UNIQUE arena-wide, so the churn lanes cycle within [0, CAP).
    const ph = new PairingHeap(CAP, 'min');
    for (let i = 0; i < CAP; i++) ph.push(i, (i * 2654435761) & 0xffff);

    let phk = (VERSION.length | 0), phacc = 0;
    // push/popMin churn: pop the extreme id, push it back with a fresh key -> steady full heap.
    // Exercises the two-pass combine (popMin) AND the O(1) root-link (push).
    const stepPhPopMin = () => {
        const id = ph.popMin();
        ph.push(id, (phk * 2654435761) & 0xffff);
        phk = (phk + 1) | 0;
    };
    // decreaseKey churn: reprioritize a resident cycling id toward the min with an ever-smaller key
    // (a descending counter keeps every move a genuine decrease -- the O(1) cut + link at root).
    let phdk = 0;
    const stepPhDecreaseKey = () => {
        ph.decreaseKey(phdk & MASK, -(phdk + 1));
        phdk = (phdk + 1) | 0;
    };
    // remove + re-push churn: addressable delete then re-insert of the SAME id -> steady full heap,
    // exercising the cut + two-pass-combine of the removed node's children + free-list free/alloc.
    const stepPhRemove = () => {
        const id = phk & MASK;
        if (ph.remove(id)) ph.push(id, (phk * 2246822519) & 0xffff);
        phk = (phk + 1) | 0;
    };
    // read mix: peekMin / peekMinKey / has / keyOf folded into an accumulator (O(1) reads).
    const stepPhRead = () => {
        const id = phk & MASK;
        phacc = (phacc + ph.peekMin() + (ph.peekMinKey() | 0) + (ph.has(id) ? 1 : 0) + (ph.keyOf(id) | 0)) | 0;
        phk = (phk + 1) | 0;
    };

    // PairingHeap MELD + arena-churn: a fixed two-heap arena, driven steady-state. meld CONSUMES its
    // donor (dead-after-meld fails closed), so to drive the O(1) meld hot body REPEATEDLY the donor
    // is REFRESHED in place (white-box scalar + alias resets -- alloc-free) then reloaded. The
    // measured body is the public O(1) meld (a single root-link + alias write) + the drain, which
    // MUST allocate zero bytes; no ctor runs in the lane, so a non-zero reading is a real regression.
    const [accP, donorP] = PairingHeap.arena(CAP, 'min', 2);
    let mpk = 0;
    const stepPhMeld = () => {
        donorP._consumed = false; donorP._root = 0; donorP._n = 0; donorP._alias[donorP._hid] = donorP._hid;
        for (let k = 0; k < 8; k++) donorP.push((mpk + k) & MASK, ((mpk + k) * 40503) & 0xffff);
        accP.meld(donorP);              // consumes donorP; O(1) root-link + alias write
        for (let k = 0; k < 8; k++) phacc = (phacc + accP.popMin()) | 0; // drain back -> steady empty accP
        mpk = (mpk + 8) | 0;
    };

    // forEach: the O(n) forest walk through a HOISTED callback -- no per-call closure alloc.
    let phfeAcc = 0;
    function phForEachCb(id, key) { phfeAcc = (phfeAcc + (id | 0) + (key | 0)) | 0; }
    const stepPhForEach = () => { ph.forEach(phForEachCb); };

    // FibonacciHeap: one out-of-loop standalone heap prefilled to capacity (its own arena). Each lane
    // is a real hot op that MUST allocate zero bytes -- the eight columns + arena-wide _pos/_owner
    // maps + union-find alias + degree-bucket scratch + private NodePool are fixed at construction;
    // the consolidation (popMin), the cascading cut (decreaseKey/remove), and the O(1) meld all
    // rewrite slot links only, never a heap object. ids are UNIQUE arena-wide, so the churn lanes
    // cycle within [0, CAP).
    const fh = new FibonacciHeap(CAP, 'min');
    for (let i = 0; i < CAP; i++) fh.push(i, (i * 2654435761) & 0xffff);

    let fhk = (VERSION.length | 0), fhacc = 0;
    // push/popMin churn: pop the extreme id, push it back with a fresh key -> steady full heap.
    // Exercises the degree consolidation (popMin) AND the O(1) root splice (push).
    const stepFhPopMin = () => {
        const id = fh.popMin();
        fh.push(id, (fhk * 2654435761) & 0xffff);
        fhk = (fhk + 1) | 0;
    };
    // decreaseKey churn: reprioritize a resident cycling id toward the min with an ever-smaller key
    // (a descending counter keeps every move a genuine decrease -- the cut + cascading cut).
    let fhdk = 0;
    const stepFhDecreaseKey = () => {
        fh.decreaseKey(fhdk & MASK, -(fhdk + 1));
        fhdk = (fhdk + 1) | 0;
    };
    // remove + re-push churn: addressable delete then re-insert of the SAME id -> steady full heap,
    // exercising the cut + cascade + splice-children consolidation + free-list free/alloc.
    const stepFhRemove = () => {
        const id = fhk & MASK;
        if (fh.remove(id)) fh.push(id, (fhk * 2246822519) & 0xffff);
        fhk = (fhk + 1) | 0;
    };
    // read mix: peekMin / peekMinKey / has / keyOf folded into an accumulator (O(1) reads).
    const stepFhRead = () => {
        const id = fhk & MASK;
        fhacc = (fhacc + fh.peekMin() + (fh.peekMinKey() | 0) + (fh.has(id) ? 1 : 0) + (fh.keyOf(id) | 0)) | 0;
        fhk = (fhk + 1) | 0;
    };

    // FibonacciHeap MELD + arena-churn: a fixed two-heap arena, driven steady-state. meld CONSUMES its
    // donor (dead-after-meld fails closed), so to drive the O(1) meld hot body REPEATEDLY the donor is
    // REFRESHED in place (white-box scalar + alias resets -- alloc-free) then reloaded. The measured
    // body is the public O(1) meld (a circular-list concat + alias write) + the drain, which MUST
    // allocate zero bytes; no ctor runs in the lane, so a non-zero reading is a real regression.
    const [accF, donorF] = FibonacciHeap.arena(CAP, 'min', 2);
    let mfk = 0;
    const stepFhMeld = () => {
        donorF._consumed = false; donorF._min = 0; donorF._n = 0; donorF._alias[donorF._hid] = donorF._hid;
        for (let k = 0; k < 8; k++) donorF.push((mfk + k) & MASK, ((mfk + k) * 40503) & 0xffff);
        accF.meld(donorF);              // consumes donorF; O(1) circular-list concat + alias write
        for (let k = 0; k < 8; k++) fhacc = (fhacc + accF.popMin()) | 0; // drain back -> steady empty accF
        mfk = (mfk + 8) | 0;
    };

    // forEach: the O(n) forest walk through a HOISTED callback -- no per-call closure alloc.
    let fhfeAcc = 0;
    function fhForEachCb(id, key) { fhfeAcc = (fhfeAcc + (id | 0) + (key | 0)) | 0; }
    const stepFhForEach = () => { fh.forEach(fhForEachCb); };

    // Fenwick2D: one out-of-loop SIDE x SIDE grid prefilled to full (SIDE^2 = CAP cells). Each lane
    // is a real hot op (or a size-preserving read) that MUST allocate zero bytes -- the one flat
    // Float64Array is fixed at construction and the nested i&-i climbs/descents use only local
    // scalars, never a heap object.
    const F2SIDE = 64;                  // 64 x 64 = 4096 cells (= CAP scale)
    const F2MASK = F2SIDE - 1;          // r & F2MASK / c & F2MASK stay in [0, SIDE)
    const f2 = new Fenwick2D(F2SIDE, F2SIDE);
    for (let r = 0; r < F2SIDE; r++) for (let c = 0; c < F2SIDE; c++) f2.update(r, c, (r * F2SIDE + c) & 0xffff);

    let f2k = 0, f2acc = 0;
    // update: climb BOTH dims by i & -i (balanced +/- so the grid never drifts to +-Infinity).
    const stepF2Update = () => {
        f2.update(f2k & F2MASK, (f2k >> 6) & F2MASK, (f2k & 1) ? 1 : -1);
        f2k = (f2k + 1) | 0;
    };
    // rectSum: the four inclusion-exclusion descents over a fixed-width window, folded in.
    const stepF2RectSum = () => {
        const r = f2k & (F2MASK >> 1), c = (f2k >> 3) & (F2MASK >> 1);
        f2acc = (f2acc + (f2.rectSum(r, c, r + 20, c + 20) | 0)) | 0;
        f2k = (f2k + 1) | 0;
    };
    // prefix: the 2D prefix descent over a cycling coordinate, folded in.
    const stepF2Prefix = () => {
        f2acc = (f2acc + (f2.prefix(f2k & F2MASK, (f2k >> 6) & F2MASK) | 0)) | 0;
        f2k = (f2k + 1) | 0;
    };
    // at: single-cell inclusion-exclusion (four descents), folded in.
    const stepF2At = () => {
        f2acc = (f2acc + (f2.at(f2k & F2MASK, (f2k >> 6) & F2MASK) | 0)) | 0;
        f2k = (f2k + 1) | 0;
    };
    // set: read-then-climb to an ABSOLUTE bounded value, one shared validation, five descents/climbs.
    const stepF2Set = () => {
        f2.set(f2k & F2MASK, (f2k >> 6) & F2MASK, f2k & 0xffff);
        f2k = (f2k + 1) | 0;
    };
    // forEach: the O(rows*cols*log^2) ascending cold scan through a HOISTED callback that closes over
    // nothing but the shared accumulator -- no per-call closure alloc.
    let f2feAcc = 0;
    function f2ForEachCb(value, r, c) { f2feAcc = (f2feAcc + (value | 0) + r + c) | 0; }
    const stepF2ForEach = () => { f2.forEach(f2ForEachCb); };

    // SegmentTree2D: one out-of-loop SIDE x SIDE grid prefilled (sum fold). Each lane is a real hot
    // op (or a size-preserving read) that MUST allocate zero bytes -- the one flat Float64Array is
    // fixed at construction and the nested iterative descents/climbs use only local scalars.
    const st2 = new SegmentTree2D(F2SIDE, F2SIDE, 'sum');
    for (let r = 0; r < F2SIDE; r++) for (let c = 0; c < F2SIDE; c++) st2.update(r, c, (r * F2SIDE + c) & 0xffff);

    let st2k = 0, st2acc = 0;
    // update: write a leaf, climb the leaf row's col-tree then the whole row-tree. Bounded value.
    const stepSt2Update = () => {
        st2.update(st2k & F2MASK, (st2k >> 6) & F2MASK, st2k & 0xffff);
        st2k = (st2k + 1) | 0;
    };
    // query: outer row descent x inner col descent over a fixed-width rectangle, folded in.
    const stepSt2Query = () => {
        const r = st2k & (F2MASK >> 1), c = (st2k >> 3) & (F2MASK >> 1);
        st2acc = (st2acc + (st2.query(r, c, r + 20, c + 20) | 0)) | 0;
        st2k = (st2k + 1) | 0;
    };
    // at: single-leaf O(1) read, folded in.
    const stepSt2At = () => {
        st2acc = (st2acc + (st2.at(st2k & F2MASK, (st2k >> 6) & F2MASK) | 0)) | 0;
        st2k = (st2k + 1) | 0;
    };
    // forEach: the O(rows*cols) ascending cold scan through a HOISTED callback -- no per-call alloc.
    let st2feAcc = 0;
    function st2ForEachCb(value, r, c) { st2feAcc = (st2feAcc + (value | 0) + r + c) | 0; }
    const stepSt2ForEach = () => { st2.forEach(st2ForEachCb); };

    // SortedArray: one out-of-loop map prefilled to half capacity (a warmed, stable sorted column).
    // Each lane is a real hot op that MUST allocate zero RETAINED bytes -- the two Float64Arrays are
    // fixed at construction, the binary search + index reads use only local scalars, the set / delete
    // shift in place via copyWithin (NO temp, NO spread -> 0 B/op even on the O(n) write), and the
    // rangeIter generator's per-step {value, done} objects are TRANSIENT (dropped each call).
    const sa = new SortedArray(CAP);
    for (let i = 0; i < HALF; i++) sa.set(i, (i * 2654435761) & 0xffff);

    let sak = 0, saacc = 0;
    // get: a hit on a resident cycling key (O(log n) binary search), folded into an accumulator.
    const stepSaGet = () => {
        saacc = (saacc + (sa.get(sak & HMASK) | 0)) | 0;
        sak = (sak + 1) | 0;
    };
    // rank / select: an O(log n) lower-bound search + an O(1) index read, folded in.
    const stepSaRankSelect = () => {
        saacc = (saacc + (sa.rank(sak & HMASK) | 0)) | 0;
        const v = sa.select(sak & (HMASK >> 1));
        saacc = (saacc + (v === undefined ? 0 : v | 0)) | 0;
        sak = (sak + 1) | 0;
    };
    // set (in-place value update of a resident key): no shift, the pure O(log n) update path.
    const stepSaSet = () => {
        sa.set(sak & HMASK, sak & 0xffff);
        sak = (sak + 1) | 0;
    };
    // SHIFT-HEAVY insert/delete: delete a resident key (O(n) shift DOWN via copyWithin) then re-insert
    // the SAME key (O(n) shift UP) -> steady size, both copyWithin shifts exercised. This is the lane
    // that PROVES the O(n) in-place shift is 0 B/op (no temp array, no spread).
    const stepSaDeleteInsert = () => {
        const key = sak & HMASK;
        if (sa.delete(key)) sa.set(key, (sak * 2246822519) & 0xffff);
        sak = (sak + 1) | 0;
    };
    // successor: a strictly-greater lookup on a cycling key, folded in.
    const stepSaSuccessor = () => {
        const v = sa.successor(sak & HMASK);
        saacc = (saacc + (v === undefined ? 0 : v | 0)) | 0;
        sak = (sak + 1) | 0;
    };
    // forEach: the O(n) CONTIGUOUS ascending scan through a HOISTED callback -- no per-call alloc.
    let safeAcc = 0;
    function saForEachCb(key, value) { safeAcc = (safeAcc + (key | 0) + (value | 0)) | 0; }
    const stepSaForEach = () => { sa.forEach(saForEachCb); };
    // rangeIter: fully consume a small fixed-width window; the generator is transient (dropped each
    // call), so retained growth is 0.
    const stepSaRangeIter = () => {
        const lo = sak & (HMASK >> 1);
        for (const key of sa.rangeIter(lo, lo + 8)) saacc = (saacc + (key | 0)) | 0;
        sak = (sak + 1) | 0;
    };

    // PersistentSegTree: two out-of-loop trees. `pstQ` is prefilled to a stable set of versions once
    // (each update path-copies preallocated slots), then the read lanes query/point-read RANDOM
    // existing versions -- pure read-only descents, 0 B/op. `pstU` drives the update (path-copy)
    // churn: each update bump-allocates <= H+1 PREALLOCATED slots, so retained growth is 0; when the
    // version arena nears full the tree is `clear()`ed (rewinds the bump cursor + re-seeds v0 in the
    // SAME backing store, 0 B/op) so the lane runs forever without reallocating.
    const PST_VC = 512;                 // stable version count for the read tree
    const pstQ = new PersistentSegTree(CAP, PST_VC, 'sum');
    let pstqv = 0;
    for (let v = 0; v < PST_VC; v++) pstqv = pstQ.update(pstqv, (v * 2654435761) & MASK, (v * 40503) & 0xffff);
    const PSTQ_VERSIONS = pstQ.versions; // = PST_VC + 1 (v0 .. vPST_VC)

    let psk = 0, psacc = 0;
    // query: fold a fixed-width window over a RANDOM existing version (version does not change the
    // O(log n) descent cost), folded into an accumulator. The gated Witness op.
    const stepPstQuery = () => {
        const ver = psk % PSTQ_VERSIONS;
        const lo = psk & (MASK >> 1);
        psacc = (psacc + (pstQ.query(ver, lo, lo + 100) | 0)) | 0;
        psk = (psk + 1) | 0;
    };
    // at: a single-leaf O(log n) read on a random version, folded in.
    const stepPstAt = () => {
        const ver = psk % PSTQ_VERSIONS;
        psacc = (psacc + (pstQ.at(ver, psk & MASK) | 0)) | 0;
        psk = (psk + 1) | 0;
    };
    // update (path-copy): branch off the current head (or v0 every 4th) with a bump-allocated
    // O(log n) path. The version arena is fixed, so `clear()` recycles it in place (0 B/op) before
    // it fills -- proving the persistent update allocates only PREALLOCATED slots.
    const pstU = new PersistentSegTree(CAP, PST_VC, 'sum');
    let pstuv = 0, pstuk = 0;
    const stepPstUpdate = () => {
        if (pstU.versions > PST_VC - 1) { pstU.clear(); pstuv = 0; }
        pstuv = pstU.update((pstuk & 3) ? pstuv : 0, pstuk & MASK, pstuk & 0xffff);
        pstuk = (pstuk + 1) | 0;
    };

    // MergeSortTree: one out-of-loop IMMUTABLE tree built once over CAP random values. Every read lane
    // is a real hot op that MUST allocate zero bytes -- the flat _t run table is fixed at construction,
    // countLE / rangeCount are read-only recursive descents that binary-search sorted runs using only
    // local scalars (0 B/op even though the descent is O(log^2 n)). There is NO mutation / clear lane
    // (the member is build-once immutable), which is exactly its static-member contract.
    const mstSrc = new Float64Array(CAP);
    for (let i = 0; i < CAP; i++) mstSrc[i] = (i * 2654435761) & 0xffff;
    const mst = MergeSortTree.build(mstSrc);
    let mstk = 0, mstacc = 0;
    // countLE: a wide-window range-rank over a cycling threshold (the gated Witness op), folded in.
    const stepMstCountLE = () => {
        mstacc = (mstacc + (mst.countLE(1, CAP - 2, mstk & 0xffff) | 0)) | 0;
        mstk = (mstk + 1) | 0;
    };
    // rangeCount: a value-window range-rank over a cycling sub-index-range, folded in.
    const stepMstRangeCount = () => {
        const lo = mstk & (MASK >> 1);
        mstacc = (mstacc + (mst.rangeCount(lo, lo + 100, (mstk & 0xff) << 4, ((mstk & 0xff) << 4) + 8000) | 0)) | 0;
        mstk = (mstk + 1) | 0;
    };

    // WaveletTree: one out-of-loop IMMUTABLE matrix built once over CAP coordinate-compressed values.
    // Every read lane is a real hot op that MUST allocate zero bytes -- the flat _words / _blk / _Z /
    // _remap arrays are fixed at construction, and access / rank / select / quantile / rangeCount are
    // read-only succinct-rank descents using only local scalars (0 B/op even where select does an UPWARD
    // binary-search climb). There is NO mutation / clear lane (the member is build-once immutable).
    const wtSrc = new Float64Array(CAP);
    for (let i = 0; i < CAP; i++) wtSrc[i] = (i * 2654435761) & MASK;   // ~CAP distinct codes
    const wt = WaveletTree.build(wtSrc);
    let wtk = 0, wtacc = 0;
    const stepWtAccess = () => {
        wtacc = (wtacc + (wt.access(wtk & MASK) | 0)) | 0;
        wtk = (wtk + 1) | 0;
    };
    const stepWtRank = () => {
        wtacc = (wtacc + (wt.rank(wtk & MASK, (wtk & MASK) + 1) | 0)) | 0;
        wtk = (wtk + 1) | 0;
    };
    // select: the UPWARD inverse descent (select0 / select1 binary searches over _rank1), folded in.
    const stepWtSelect = () => {
        const r = wt.select(wtk & MASK, 0);
        wtacc = (wtacc + (r === undefined ? 0 : r | 0)) | 0;
        wtk = (wtk + 1) | 0;
    };
    // quantile: the gated Witness op -- k-th smallest over a wide window for a cycling k, folded in.
    const stepWtQuantile = () => {
        wtacc = (wtacc + (wt.quantile(1, CAP - 2, wtk & (MASK >> 1)) | 0)) | 0;
        wtk = (wtk + 1) | 0;
    };
    const stepWtRangeCount = () => {
        const lo = wtk & (MASK >> 1);
        wtacc = (wtacc + (wt.rangeCount(lo, lo + 100, 0, wtk & MASK) | 0)) | 0;
        wtk = (wtk + 1) | 0;
    };

    // CartesianTree: one out-of-loop IMMUTABLE tree built once over CAP seeded values. Every read lane is
    // a real hot op that MUST allocate zero bytes -- the flat _val / _left / _right / _parent / _depth /
    // _up arrays are fixed at construction, and rangeMinIndex / rangeMin / at / parent / left / right /
    // depth are read-only descents / point reads using only local scalars (0 B/op even where
    // rangeMinIndex does the binary-lifting LCA climb). There is NO mutation / clear lane (build-once
    // immutable).
    const ctSrc = new Float64Array(CAP);
    for (let i = 0; i < CAP; i++) ctSrc[i] = (i * 2654435761) & MASK;
    const ct = CartesianTree.build(ctSrc, 'min');
    let ctk = 0, ctacc = 0;
    // rangeMinIndex: the gated Witness op -- a wide-window extreme-index LCA climb over a cycling range.
    const stepCtRangeMinIndex = () => {
        const lo = ctk & (MASK >> 1);
        ctacc = (ctacc + (ct.rangeMinIndex(lo, lo + (CAP >> 1)) | 0)) | 0;
        ctk = (ctk + 1) | 0;
    };
    // rangeMin: the same climb, returning the extreme VALUE (one extra _val read), folded in.
    const stepCtRangeMin = () => {
        const lo = ctk & (MASK >> 1);
        ctacc = (ctacc + (ct.rangeMin(lo, lo + (CAP >> 1)) | 0)) | 0;
        ctk = (ctk + 1) | 0;
    };
    // at: an O(1) point read over the flat _val array, folded in.
    const stepCtAt = () => {
        ctacc = (ctacc + (ct.at(ctk & MASK) | 0)) | 0;
        ctk = (ctk + 1) | 0;
    };
    // parent / left / right / depth: O(1) point reads over the flat structural arrays, folded in.
    const stepCtTopology = () => {
        const i = ctk & MASK;
        ctacc = (ctacc + (ct.parent(i) | 0) + (ct.left(i) | 0) + (ct.right(i) | 0) + (ct.depth(i) | 0)) | 0;
        ctk = (ctk + 1) | 0;
    };

    // LinkCutTree: one out-of-loop forest -- a warmed CAP-node balanced-ish tree (each node linked to its
    // halved index). Every lane is a real hot op that MUST allocate zero bytes: link / cut / evert flip
    // EDGES only (no free-list, no bump allocator), and _splay uses the preallocated _stk scratch (no
    // recursion, no per-op stack). pathAggregate / findRoot / connected are MUTATING reads (they splay),
    // the load-bearing proof that a self-adjusting amortized read allocates zero RETAINED bytes.
    const lct = new LinkCutTree(CAP, 'sum');
    for (let i = 0; i < CAP; i++) lct.setValue(i, (i * 2654435761) & MASK);
    for (let i = 1; i < CAP; i++) lct.link(i, i >> 1);      // a balanced binary-ish tree over [0, CAP)
    let lctk = 0, lctacc = 0;
    // pathAggregate(u): the gated Witness op -- fold over the root-to-u path (SPLAYS u), folded in.
    const stepLctPathAgg = () => {
        lctacc = (lctacc + (lct.pathAggregate(lctk & MASK) | 0)) | 0;
        lctk = (lctk + 1) | 0;
    };
    // pathAggregate(u, v): the two-endpoint fold (everts u, accesses v), folded in.
    const stepLctPathAgg2 = () => {
        lctacc = (lctacc + (lct.pathAggregate(lctk & MASK, (lctk * 40503) & MASK) | 0)) | 0;
        lctk = (lctk + 1) | 0;
    };
    // findRoot: a mutating read that everts nothing but splays the min-depth node, folded in.
    const stepLctFindRoot = () => {
        lctacc = (lctacc + (lct.findRoot(lctk & MASK) | 0)) | 0;
        lctk = (lctk + 1) | 0;
    };
    // connected: two accesses (both splay), folded in.
    const stepLctConnected = () => {
        lctacc = (lctacc + (lct.connected(lctk & MASK, (lctk * 2246822519) & MASK) ? 1 : 0)) | 0;
        lctk = (lctk + 1) | 0;
    };
    // cut + re-link churn: detach a node from its parent then re-link it -- the dynamic-forest hot loop.
    // Node 0 is the root (no parent edge), so cut a non-root leaf-ish node and re-link it to the same
    // parent, keeping the forest shape steady. Flip EDGES only -> 0 B/op.
    const stepLctCutLink = () => {
        const x = 1 + (lctk & (MASK >> 1));                 // a non-root node in [1, CAP/2)
        const p = x >> 1;
        lct.evert(p);                                       // root at p so x's parent edge is p
        lct.cut(x);
        lct.link(x, p);
        lctk = (lctk + 1) | 0;
    };
    // setValue: a mutating value write (access + pull), folded in.
    const stepLctSetValue = () => {
        lct.setValue(lctk & MASK, (lctk * 2654435761) & MASK);
        lctacc = (lctacc + (lct.at(lctk & MASK) | 0)) | 0;
        lctk = (lctk + 1) | 0;
    };

    // CONTROL (teeth): a lane that MUST allocate RETAINED bytes -- measureAllocs
    // reports per-call RETAINED heap growth (min over batches), so the control
    // pushes into a live array that grows every call. The instrument has to report
    // > 0 bytes for it, or the 0 B/op verdict on the real lanes is worthless (a
    // blind measureAllocs that always read 0 would pass a regressed member). This
    // is the T9-style control: the allocation MUST be caught.
    const controlSink = [];
    const stepControlAlloc = () => {
        controlSink.push({ v: fk & 0xffff }); // a fresh RETAINED object every call
        fk = (fk + 1) | 0;
    };

    let allocBytes = 0;
    for (const step of [stepPushPop, stepChangeKey, stepRemove, stepRead,
        stepUpdate, stepPrefix, stepAt, stepRangeSum, stepSet,
        stepSegUpdate, stepSegQuery, stepSegAt,
        stepSlGet, stepSlSet, stepSlDelete, stepSlSuccessor,
        stepTrGet, stepTrSet, stepTrDelete, stepTrRankSelect, stepTrSuccessor,
        stepScGet, stepScSet, stepScDelete, stepScRankSelect, stepScSuccessor, stepScRebuild,
        stepMmhPopMin, stepMmhPopMax, stepMmhMixed, stepMmhRead,
        stepSpGet, stepSpWorkingSet, stepSpSet, stepSpDelete, stepSpSuccessor,
        stepBinhPopMin, stepBinhRead, stepBinhMeld,
        stepPhPopMin, stepPhDecreaseKey, stepPhRemove, stepPhRead, stepPhMeld,
        stepFhPopMin, stepFhDecreaseKey, stepFhRemove, stepFhRead, stepFhMeld,
        stepF2Update, stepF2RectSum, stepF2Prefix, stepF2At, stepF2Set,
        stepSt2Update, stepSt2Query, stepSt2At,
        stepSaGet, stepSaRankSelect, stepSaSet, stepSaSuccessor,
        stepPstQuery, stepPstAt, stepPstUpdate,
        stepMstCountLE, stepMstRangeCount,
        stepWtAccess, stepWtRank, stepWtSelect, stepWtQuantile, stepWtRangeCount,
        stepCtRangeMinIndex, stepCtRangeMin, stepCtAt, stepCtTopology,
        stepLctPathAgg, stepLctPathAgg2, stepLctFindRoot, stepLctConnected, stepLctCutLink, stepLctSetValue]) {
        const r = measureAllocs(step, { iterations: 100000, batches: 8 });
        const bpc = r.bytesPerCall === null ? 0 : r.bytesPerCall;
        const b = Math.max(0, Math.round(bpc));
        if (b > allocBytes) allocBytes = b;
    }
    // forEach is O(n) per call (n = CAP = 4096) -- a far heavier body than the
    // O(log n) lanes above, so the two forEach lanes get their own (smaller)
    // iteration budget. rangeIter walks a window and drives the generator protocol,
    // so it shares that smaller budget. The gate is identical: 0 B/op or the whole
    // verdict fails.
    for (const step of [stepForEach, stepSegForEach, stepSlRangeIter, stepTrForEach, stepTrRangeIter,
        stepScForEach, stepScRangeIter, stepSpForEach, stepSpRangeIter, stepBinhForEach, stepPhForEach, stepFhForEach,
        stepF2ForEach, stepSt2ForEach,
        stepSaDeleteInsert, stepSaForEach, stepSaRangeIter]) {
        const r = measureAllocs(step, { iterations: 3000, batches: 8 });
        const bpc = r.bytesPerCall === null ? 0 : r.bytesPerCall;
        const b = Math.max(0, Math.round(bpc));
        if (b > allocBytes) allocBytes = b;
    }
    if (racc === 0x7fffffff) throw new Error('unreachable'); // keep racc live
    if (facc === 0x7fffffff) throw new Error('unreachable'); // keep facc live
    if (feAcc === 0x7fffffff) throw new Error('unreachable'); // keep feAcc live
    if (sacc === 0x7fffffff) throw new Error('unreachable'); // keep sacc live
    if (sfeAcc === 0x7fffffff) throw new Error('unreachable'); // keep sfeAcc live
    if (lacc === 0x7fffffff) throw new Error('unreachable'); // keep lacc live
    if (tracc === 0x7fffffff) throw new Error('unreachable'); // keep tracc live
    if (trfeAcc === 0x7fffffff) throw new Error('unreachable'); // keep trfeAcc live
    if (scacc === 0x7fffffff) throw new Error('unreachable'); // keep scacc live
    if (scfeAcc === 0x7fffffff) throw new Error('unreachable'); // keep scfeAcc live
    if (macc === 0x7fffffff) throw new Error('unreachable'); // keep macc live
    if (spacc === 0x7fffffff) throw new Error('unreachable'); // keep spacc live
    if (spfeAcc === 0x7fffffff) throw new Error('unreachable'); // keep spfeAcc live
    if (bhacc === 0x7fffffff) throw new Error('unreachable'); // keep bhacc live
    if (bhfeAcc === 0x7fffffff) throw new Error('unreachable'); // keep bhfeAcc live
    if (phacc === 0x7fffffff) throw new Error('unreachable'); // keep phacc live
    if (phfeAcc === 0x7fffffff) throw new Error('unreachable'); // keep phfeAcc live
    if (fhacc === 0x7fffffff) throw new Error('unreachable'); // keep fhacc live
    if (fhfeAcc === 0x7fffffff) throw new Error('unreachable'); // keep fhfeAcc live
    if (f2acc === 0x7fffffff) throw new Error('unreachable'); // keep f2acc live
    if (f2feAcc === 0x7fffffff) throw new Error('unreachable'); // keep f2feAcc live
    if (st2acc === 0x7fffffff) throw new Error('unreachable'); // keep st2acc live
    if (st2feAcc === 0x7fffffff) throw new Error('unreachable'); // keep st2feAcc live
    if (saacc === 0x7fffffff) throw new Error('unreachable'); // keep saacc live
    if (safeAcc === 0x7fffffff) throw new Error('unreachable'); // keep safeAcc live
    if (psacc === 0x7fffffff) throw new Error('unreachable'); // keep psacc live
    if (mstacc === 0x7fffffff) throw new Error('unreachable'); // keep mstacc live
    if (wtacc === 0x7fffffff) throw new Error('unreachable'); // keep wtacc live
    if (ctacc === 0x7fffffff) throw new Error('unreachable'); // keep ctacc live
    if (lctacc === 0x7fffffff) throw new Error('unreachable'); // keep lctacc live
    const allocOk = allocBytes === 0;

    // The control MUST be detected as allocating (teeth). If it reads 0, the
    // instrument is blind and the whole gate is void.
    const cr = measureAllocs(stepControlAlloc, { iterations: 50000, batches: 8 });
    const controlBytes = cr.bytesPerCall === null ? 0 : Math.max(0, Math.round(cr.bytesPerCall));
    if (controlSink.length === -1) throw new Error('unreachable'); // keep controlSink live
    const controlOk = controlBytes > 0;

    // ---- phase 2b: GC budget over a steady-state window --------------------
    // A representative churn mix on the out-of-loop heap: push/pop every op, a
    // changeKey every 8th, a remove+push every 64th. Steady full heap, zero alloc.
    const gc = new GcProfiler().start();
    let sink = racc | 0;
    for (let i = 0; i < HOT; i++) {
        const id = inst.pop();
        inst.push(id, (i * 2654435761) & 0xffff);
        if ((i & 7) === 0) inst.changeKey(i & MASK, (i * 40503) & 0xffff);
        if ((i & 63) === 0) { const rid = i & MASK; if (inst.remove(rid)) inst.push(rid, i & 0xffff); }
        // Fenwick churn every op: an update (balanced +/-) and a prefix read, plus
        // an at/rangeSum every 8th. Steady tree, zero alloc.
        fen.update(i & MASK, (i & 1) ? 1 : -1);
        sink = (sink + id + (fen.prefix(i & MASK) | 0)) | 0;
        if ((i & 7) === 0) sink = (sink + (fen.at(i & MASK) | 0)) | 0;
        if ((i & 63) === 0) { const lo = i & (MASK >> 1); sink = (sink + (fen.rangeSum(lo, lo + 100) | 0)) | 0; }
        // SegmentTree churn every op: an absolute bounded update and a windowed
        // query, plus an at every 8th. Steady tree, zero alloc.
        seg.update(i & MASK, i & 0xffff);
        { const lo = i & (MASK >> 1); sink = (sink + (seg.query(lo, lo + 100) | 0)) | 0; }
        if ((i & 7) === 0) sink = (sink + (seg.at(i & MASK) | 0)) | 0;
        // SkipList churn every op: an in-place value set and a get, plus a
        // delete+re-set every 64th (pool alloc/free) and a successor every 8th.
        // Steady tower, zero alloc.
        sl.set(i & HMASK, i & 0xffff);
        sink = (sink + (sl.get(i & HMASK) | 0)) | 0;
        if ((i & 7) === 0) { const v = sl.successor(i & HMASK); sink = (sink + (v === undefined ? 0 : v | 0)) | 0; }
        if ((i & 63) === 0) { const key = i & HMASK; if (sl.delete(key)) sl.set(key, i & 0xffff); }
        // Treap churn every op: an in-place value set, a get and a rank, plus a
        // delete+re-set every 64th (pool free/alloc + recursive merge) and a
        // select+successor every 8th. Steady tree, zero alloc.
        tr.set(i & HMASK, i & 0xffff);
        sink = (sink + (tr.get(i & HMASK) | 0) + (tr.rank(i & HMASK) | 0)) | 0;
        if ((i & 7) === 0) {
            const sv = tr.select(i & (HMASK >> 1));
            const su = tr.successor(i & HMASK);
            sink = (sink + (sv === undefined ? 0 : sv | 0) + (su === undefined ? 0 : su | 0)) | 0;
        }
        if ((i & 63) === 0) { const key = i & HMASK; if (tr.delete(key)) tr.set(key, i & 0xffff); }
        // Scapegoat churn every op: an in-place value set, a get and a rank, plus a
        // delete+re-set every 64th (free/alloc + recursive delete) and a select+successor
        // every 8th. A rebuild-heavy ascending-insert step every op keeps the _rebuild path
        // hot inside the GC window. Steady trees, zero alloc.
        sc.set(i & HMASK, i & 0xffff);
        sink = (sink + (sc.get(i & HMASK) | 0) + (sc.rank(i & HMASK) | 0)) | 0;
        if ((i & 7) === 0) {
            const sv = sc.select(i & (HMASK >> 1));
            const su = sc.successor(i & HMASK);
            sink = (sink + (sv === undefined ? 0 : sv | 0) + (su === undefined ? 0 : su | 0)) | 0;
        }
        if ((i & 63) === 0) { const key = i & HMASK; if (sc.delete(key)) sc.set(key, i & 0xffff); }
        if (scReb.size >= 511) scReb.clear();
        scReb.set(i, i & 0xffff); // ascending -> forces repeated subtree rebuilds
        // MinMaxHeap churn every op: pop the min and push a fresh id/key back (steady full
        // heap), plus a popMax+push every 8th (the other trickle-down) and a peek-both every
        // 64th. Steady DEPQ, zero alloc.
        { const id = mmh.popMin(); mmh.push(id, (i * 2654435761) & 0xffff); sink = (sink + id) | 0; }
        if ((i & 7) === 0) { const id = mmh.popMax(); mmh.push(id, (i * 40503) & 0xffff); sink = (sink + id) | 0; }
        if ((i & 63) === 0) sink = (sink + mmh.peekMin() + mmh.peekMax()) | 0;
        // SplayTree churn every op: an in-place value set and a get (which SPLAYS -- keeps the
        // restructuring hot inside the GC window), plus a working-set get every op (small hot
        // set), a successor every 8th and a delete+re-set every 64th (pool free/alloc + splay-
        // join). Steady tree, zero alloc even though every read restructures.
        sp.set(i & HMASK, i & 0xffff);
        sink = (sink + (sp.get(i & HMASK) | 0) + (sp.get(i & 15) | 0)) | 0;
        if ((i & 7) === 0) { const v = sp.successor(i & HMASK); sink = (sink + (v === undefined ? 0 : v | 0)) | 0; }
        if ((i & 63) === 0) { const key = i & HMASK; if (sp.delete(key)) sp.set(key, i & 0xffff); }
        // BinomialHeap churn every op: popMin then push a fresh id/key back (steady full heap),
        // exercising the union binary-carry + the child-reverse/remeld/rescan. A meld+arena-churn
        // round fires SPARSELY (every 8192nd) on a fresh tiny arena: meld two arena-siblings then
        // drain the result, proving meld runs inside the GC window with NO major collection. The
        // cadence is sparse so the tiny transient arenas stay in new space (scavenged, never
        // promoted) -- no major GC. Steady heap otherwise, zero alloc.
        { const id = binh.popMin(); binh.push(id, (i * 2654435761) & 0xffff); sink = (sink + id) | 0; }
        if ((i & 63) === 0) sink = (sink + binh.peekMin()) | 0;
        if ((i & 8191) === 0) {
            const [ca, cb] = BinomialHeap.arena(128, 'min', 2);
            for (let k = 0; k < 64; k++) ca.push(k, (k * 2654435761) & 0xffff);
            for (let k = 0; k < 64; k++) cb.push(k + 64, (k * 40503) & 0xffff);
            ca.meld(cb); // consumes cb; O(log n) root relink
            while (ca.size > 0) sink = (sink + ca.popMin()) | 0;
        }
        // PairingHeap churn every op: popMin then push a fresh id/key back (steady full heap),
        // exercising the two-pass combine (popMin) + the O(1) root-link (push). A decreaseKey every
        // 8th (O(1) cut + link) and a remove+re-push every 64th (cut + two-pass-combine of children).
        // A meld+arena-churn round fires SPARSELY (every 8192nd) on a fresh tiny arena: meld two
        // arena-siblings then drain -- proving the O(1) meld runs inside the GC window with NO major
        // collection (the transient arenas stay in new space). Steady heap otherwise, zero alloc.
        { const id = ph.popMin(); ph.push(id, (i * 2654435761) & 0xffff); sink = (sink + id) | 0; }
        if ((i & 7) === 0) ph.decreaseKey(i & MASK, -((i >>> 3) + 1));
        if ((i & 63) === 0) { const rid = i & MASK; if (ph.remove(rid)) ph.push(rid, i & 0xffff); }
        if ((i & 8191) === 0) {
            const [pa, pb] = PairingHeap.arena(128, 'min', 2);
            for (let k = 0; k < 64; k++) pa.push(k, (k * 2654435761) & 0xffff);
            for (let k = 0; k < 64; k++) pb.push(k + 64, (k * 40503) & 0xffff);
            pa.meld(pb); // consumes pb; O(1) root relink
            while (pa.size > 0) sink = (sink + pa.popMin()) | 0;
        }
        // FibonacciHeap churn every op: popMin then push a fresh id/key back (steady full heap),
        // exercising the degree consolidation (popMin) + the O(1) root splice (push). A decreaseKey
        // every 8th (cut + cascading cut) and a remove+re-push every 64th (cut + splice-children
        // consolidation). A meld+arena-churn round fires SPARSELY (every 8192nd) on a fresh tiny
        // arena: meld two arena-siblings then drain -- proving the O(1) meld runs inside the GC window
        // with NO major collection (the transient arenas stay in new space). Steady, zero alloc.
        { const id = fh.popMin(); fh.push(id, (i * 2654435761) & 0xffff); sink = (sink + id) | 0; }
        if ((i & 7) === 0) fh.decreaseKey(i & MASK, -((i >>> 3) + 1));
        if ((i & 63) === 0) { const rid = i & MASK; if (fh.remove(rid)) fh.push(rid, i & 0xffff); }
        if ((i & 8191) === 0) {
            const [fa, fb] = FibonacciHeap.arena(128, 'min', 2);
            for (let k = 0; k < 64; k++) fa.push(k, (k * 2654435761) & 0xffff);
            for (let k = 0; k < 64; k++) fb.push(k + 64, (k * 40503) & 0xffff);
            fa.meld(fb); // consumes fb; O(1) circular-list concat
            while (fa.size > 0) sink = (sink + fa.popMin()) | 0;
        }
        // Fenwick2D churn every op: a balanced +/- 2D update and a 2D prefix read, plus a rectSum
        // every 8th and an absolute set every 64th. Nested i&-i climbs/descents; steady grid, zero alloc.
        f2.update(i & F2MASK, (i >> 6) & F2MASK, (i & 1) ? 1 : -1);
        sink = (sink + (f2.prefix(i & F2MASK, (i >> 6) & F2MASK) | 0)) | 0;
        if ((i & 7) === 0) { const r = i & (F2MASK >> 1), c = (i >> 3) & (F2MASK >> 1); sink = (sink + (f2.rectSum(r, c, r + 20, c + 20) | 0)) | 0; }
        if ((i & 63) === 0) f2.set(i & F2MASK, (i >> 6) & F2MASK, i & 0xffff);
        // SegmentTree2D churn every op: an absolute bounded update and a windowed rectangle query.
        // Nested iterative descents/climbs; steady grid, zero alloc.
        st2.update(i & F2MASK, (i >> 6) & F2MASK, i & 0xffff);
        { const r = i & (F2MASK >> 1), c = (i >> 3) & (F2MASK >> 1); sink = (sink + (st2.query(r, c, r + 20, c + 20) | 0)) | 0; }
        // SortedArray churn every op: an in-place value set and a get (O(log n) binary search), plus a
        // rank+select every 8th and a delete+re-insert every 64th -- the SHIFT-HEAVY O(n) copyWithin
        // path (both a shift-down and a shift-up), kept hot inside the GC window to prove the O(n) write
        // is 0 B/op. Steady size, zero alloc.
        sa.set(i & HMASK, i & 0xffff);
        sink = (sink + (sa.get(i & HMASK) | 0)) | 0;
        if ((i & 7) === 0) {
            sink = (sink + (sa.rank(i & HMASK) | 0)) | 0;
            const sv = sa.select(i & (HMASK >> 1));
            sink = (sink + (sv === undefined ? 0 : sv | 0)) | 0;
        }
        if ((i & 63) === 0) { const key = i & HMASK; if (sa.delete(key)) sa.set(key, i & 0xffff); }
        // PersistentSegTree churn every op: a path-copying update (branch off the head, or v0 every
        // 4th) and a random-version windowed query, plus a random-version point read every 8th. The
        // fixed version arena is recycled in place via clear() before it fills (rewinds the bump
        // cursor + re-seeds v0 in the SAME backing store, 0 B/op) -- so the persistent update runs
        // inside the GC window allocating only PREALLOCATED slots, no major collection.
        if (pstU.versions > PST_VC - 1) { pstU.clear(); pstuv = 0; }
        pstuv = pstU.update((i & 3) ? pstuv : 0, i & MASK, i & 0xffff);
        { const ver = i % PSTQ_VERSIONS; const lo = i & (MASK >> 1); sink = (sink + (pstQ.query(ver, lo, lo + 100) | 0)) | 0; }
        if ((i & 7) === 0) { const ver = i % PSTQ_VERSIONS; sink = (sink + (pstQ.at(ver, i & MASK) | 0)) | 0; }
        // MergeSortTree churn every op: a wide-window countLE range-rank (the gated O(log^2 n) read),
        // plus a value-window rangeCount every 8th. The tree is IMMUTABLE (no writes), so this is a pure
        // read-only descent that must allocate zero bytes and trigger no major collection.
        sink = (sink + (mst.countLE(1, CAP - 2, i & 0xffff) | 0)) | 0;
        if ((i & 7) === 0) { const lo = i & (MASK >> 1); sink = (sink + (mst.rangeCount(lo, lo + 100, 0, i & 0xffff) | 0)) | 0; }
        // WaveletTree churn every op: a wide-window quantile (the gated O(log sigma) read), plus an
        // access every 4th, a rank every 8th, a select every 16th, and a value-window rangeCount every
        // 32nd. The matrix is IMMUTABLE (no writes), so this is a pure read-only descent that must
        // allocate zero bytes and trigger no major collection (select's upward climb included).
        sink = (sink + (wt.quantile(1, CAP - 2, i & (MASK >> 1)) | 0)) | 0;
        if ((i & 3) === 0) sink = (sink + (wt.access(i & MASK) | 0)) | 0;
        if ((i & 7) === 0) sink = (sink + (wt.rank(i & MASK, (i & MASK) + 1) | 0)) | 0;
        if ((i & 15) === 0) { const r = wt.select(i & MASK, 0); sink = (sink + (r === undefined ? 0 : r | 0)) | 0; }
        if ((i & 31) === 0) { const lo = i & (MASK >> 1); sink = (sink + (wt.rangeCount(lo, lo + 100, 0, i & MASK) | 0)) | 0; }
        // CartesianTree churn every op: a wide-window rangeMinIndex (the gated O(log n) LCA climb), plus a
        // rangeMin every 4th, an at every 8th, and a parent/depth topology read every 16th. The tree is
        // IMMUTABLE (no writes), so this is a pure read-only climb that allocates zero bytes and triggers
        // no major collection.
        { const lo = i & (MASK >> 1); sink = (sink + (ct.rangeMinIndex(lo, lo + (CAP >> 1)) | 0)) | 0; }
        if ((i & 3) === 0) { const lo = i & (MASK >> 1); sink = (sink + (ct.rangeMin(lo, lo + (CAP >> 1)) | 0)) | 0; }
        if ((i & 7) === 0) sink = (sink + (ct.at(i & MASK) | 0)) | 0;
        if ((i & 15) === 0) { const j = i & MASK; sink = (sink + (ct.parent(j) | 0) + (ct.depth(j) | 0)) | 0; }
        // LinkCutTree churn every op: a wide-window pathAggregate (the gated amortized-O(log n) SPLAY read),
        // plus a two-endpoint fold every 4th, a findRoot every 8th, a connected every 16th, a setValue every
        // 32nd, and -- the load-bearing DYNAMIC-FOREST lane -- a cut + re-link every 64th (evert to expose
        // the parent edge, cut it, re-link). link/cut/evert flip EDGES only, so the whole forest churn runs
        // inside the GC window allocating zero bytes and triggering no major collection.
        sink = (sink + (lct.pathAggregate(i & MASK) | 0)) | 0;
        if ((i & 3) === 0) sink = (sink + (lct.pathAggregate(i & MASK, (i * 40503) & MASK) | 0)) | 0;
        if ((i & 7) === 0) sink = (sink + (lct.findRoot(i & MASK) | 0)) | 0;
        if ((i & 15) === 0) sink = (sink + (lct.connected(i & MASK, (i * 2246822519) & MASK) ? 1 : 0)) | 0;
        if ((i & 31) === 0) lct.setValue(i & MASK, i & 0xffff);
        if ((i & 63) === 0) { const x = 1 + (i & (MASK >> 1)); const p = x >> 1; lct.evert(p); lct.cut(x); lct.link(x, p); }
        if ((i & 8191) === 0) {
            gc.sampleHeap(performance.now(), process.memoryUsage().heapUsed);
        }
    }
    await new Promise((r) => setTimeout(r, 50));
    const s2 = gc.summary();
    const report = checkNoGc(s2, { maxMajor: 0, maxPauseMs: 2 });
    gc.stop();

    // ---- phase 2c: arrayBuffers must not grow ------------------------------
    // Fill / clear ONE reused heap in a loop: the three typed arrays are fixed at
    // construction, so no fill/clear cycle allocates a new backing store and
    // arrayBuffers must not grow.
    const abHeap = new BinaryHeap(1024, 'min');
    const abFen = new Fenwick(1024);
    const abSeg = new SegmentTree(1024, 'sum');
    const abSl = new SkipList(1024, 0x1234);
    const abTr = new Treap(1024, 0x1234);
    const abSc = new Scapegoat(1024);
    const abMmh = new MinMaxHeap(1024);
    const abSp = new SplayTree(1024);
    const abBinh = new BinomialHeap(1024, 'min');
    const abPh = new PairingHeap(1024, 'min');
    const abFh = new FibonacciHeap(1024, 'min');
    const abF2 = new Fenwick2D(32, 32); // 1024 cells; one flat Float64Array, reused across the soak
    const abSt2 = new SegmentTree2D(32, 32, 'sum'); // 4096 cells; one flat Float64Array, reused
    const abSa = new SortedArray(1024); // two Float64Arrays, reused across the soak (copyWithin in place)
    const abPst = new PersistentSegTree(1024, 256, 'sum'); // node columns + _roots, reused (bump + clear in place)
    // MergeSortTree is IMMUTABLE (build-once, no mutators): one flat _t run table, fixed at
    // construction. Built ONCE here and only READ in the soak below, so its backing store trivially
    // cannot grow -- the static-member analogue of the fill/clear reuse the mutable members prove.
    const abMstSrc = new Float64Array(1024);
    for (let i = 0; i < 1024; i++) abMstSrc[i] = (i * 2654435761) & 0xffff;
    const abMst = MergeSortTree.build(abMstSrc);
    // WaveletTree is IMMUTABLE too: flat _words / _blk / _Z / _remap arrays fixed at construction. Built
    // ONCE here and only READ in the soak below, so its backing stores trivially cannot grow.
    const abWtSrc = new Float64Array(1024);
    for (let i = 0; i < 1024; i++) abWtSrc[i] = (i * 2654435761) & 0x3ff;
    const abWt = WaveletTree.build(abWtSrc);
    // CartesianTree is IMMUTABLE too: flat _val / _left / _right / _parent / _depth / _up arrays fixed at
    // construction. Built ONCE here and only READ in the soak below, so its backing stores cannot grow.
    const abCtSrc = new Float64Array(1024);
    for (let i = 0; i < 1024; i++) abCtSrc[i] = (i * 2654435761) & 0x3ff;
    const abCt = CartesianTree.build(abCtSrc, 'min');
    // LinkCutTree is MUTABLE via link / cut but its eight typed-array columns + scratch stack are FIXED at
    // construction: link / cut / evert flip EDGES only (no free-list, no bump allocator), so a full
    // cut-then-re-link churn round reuses the SAME backing stores and arrayBuffers must not grow. Built ONCE
    // here as a chain over [0, 1024); the soak churns its edges and asserts the edge count is conserved.
    const abLct = new LinkCutTree(1024, 'sum');
    for (let i = 0; i < 1024; i++) abLct.setValue(i, (i * 2654435761) & 0xffff);
    for (let i = 1; i < 1024; i++) abLct.link(i, i - 1);   // a chain 0-1-...-1023 (1023 edges)
    // A reused two-heap arena for the conservation-ACROSS-MELD soak (one backing store, so
    // arrayBuffers stay flat). The donor is refreshed in place each round (white-box) so the
    // consumed-fails-closed contract does not force a fresh allocation per soak cycle.
    const [abMeldAcc, abMeldDonor] = BinomialHeap.arena(1024, 'min', 2);
    // The same conservation-ACROSS-MELD soak for PairingHeap's O(1) meld (one backing store).
    const [abPhMeldAcc, abPhMeldDonor] = PairingHeap.arena(1024, 'min', 2);
    // The same conservation-ACROSS-MELD soak for FibonacciHeap's O(1) meld (one backing store).
    const [abFhMeldAcc, abFhMeldDonor] = FibonacciHeap.arena(1024, 'min', 2);
    globalThis.gc();
    await new Promise((r) => setTimeout(r, 50));
    globalThis.gc();
    const abBefore = process.memoryUsage().arrayBuffers;
    // Conservation invariant: the SkipList's private free-list must balance
    // (activeSlots + freeListLength === capacity) after EVERY fill/clear soak cycle.
    let conservationOk = true;
    for (let r = 0; r < 2000; r++) {
        for (let i = 0; i < 1024; i++) abHeap.push(i, (i * 2654435761) & 0xffff);
        abHeap.clear();
        for (let i = 0; i < 1024; i++) abFen.update(i, (i * 2654435761) & 0xffff);
        abFen.clear();
        for (let i = 0; i < 1024; i++) abSeg.update(i, (i * 2654435761) & 0xffff);
        abSeg.clear();
        for (let i = 0; i < 1024; i++) abSl.set((i * 2654435761) & 1023, i);
        if (abSl._pool.activeSlots + abSl._pool.freeListLength !== abSl._pool.capacity) conservationOk = false;
        // Exercise the free() path directly: a fill-then-bulk-clear cycle alone
        // NEVER calls NodePool.free() (clear() resets the pool in one shot instead),
        // so a broken free() (e.g. a dropped activeSlots decrement) would sail
        // through this check untested. Half the slots go through a real
        // delete() -> free() -> set() -> alloc() round trip every soak cycle.
        for (let i = 0; i < 512; i++) abSl.delete((i * 2654435761) & 1023);
        if (abSl._pool.activeSlots + abSl._pool.freeListLength !== abSl._pool.capacity) conservationOk = false;
        for (let i = 0; i < 512; i++) abSl.set((i * 2654435761) & 1023, i);
        if (abSl._pool.activeSlots + abSl._pool.freeListLength !== abSl._pool.capacity) conservationOk = false;
        abSl.clear();
        if (abSl._pool.activeSlots + abSl._pool.freeListLength !== abSl._pool.capacity) conservationOk = false;
        // Treap: same free-list conservation contract as SkipList. A fill, then a real
        // delete() -> _merge -> _pool.free() round trip on half the slots, then a
        // refill, then clear -- the invariant must hold after each phase.
        for (let i = 0; i < 1024; i++) abTr.set((i * 2654435761) & 1023, i);
        if (abTr._pool.activeSlots + abTr._pool.freeListLength !== abTr._pool.capacity) conservationOk = false;
        for (let i = 0; i < 512; i++) abTr.delete((i * 2654435761) & 1023);
        if (abTr._pool.activeSlots + abTr._pool.freeListLength !== abTr._pool.capacity) conservationOk = false;
        for (let i = 0; i < 512; i++) abTr.set((i * 2654435761) & 1023, i);
        if (abTr._pool.activeSlots + abTr._pool.freeListLength !== abTr._pool.capacity) conservationOk = false;
        abTr.clear();
        if (abTr._pool.activeSlots + abTr._pool.freeListLength !== abTr._pool.capacity) conservationOk = false;
        // Scapegoat: same free-list conservation contract. An ASCENDING fill (forces subtree
        // rebuilds), then a real delete() round trip on half the slots (recursive delete +
        // possible global rebuild), then a refill, then clear -- the invariant must hold after
        // each phase (a rebuild that leaked/double-freed a slot would break it here).
        for (let i = 0; i < 1024; i++) abSc.set(i, i); // ascending -> rebuild-heavy
        if (abSc._pool.activeSlots + abSc._pool.freeListLength !== abSc._pool.capacity) conservationOk = false;
        for (let i = 0; i < 512; i++) abSc.delete((i * 2654435761) & 1023);
        if (abSc._pool.activeSlots + abSc._pool.freeListLength !== abSc._pool.capacity) conservationOk = false;
        for (let i = 0; i < 512; i++) abSc.set((i * 2654435761) & 1023, i);
        if (abSc._pool.activeSlots + abSc._pool.freeListLength !== abSc._pool.capacity) conservationOk = false;
        abSc.clear();
        if (abSc._pool.activeSlots + abSc._pool.freeListLength !== abSc._pool.capacity) conservationOk = false;
        // MinMaxHeap: fixed two typed arrays, no free-list. A full fill then bulk clear
        // reuses the SAME backing store, so arrayBuffers must not grow across soak cycles.
        for (let i = 0; i < 1024; i++) abMmh.push(i & 0xffff, (i * 2654435761) & 0xffff);
        abMmh.clear();
        // Fenwick2D: one flat Float64Array, fixed at construction. A full grid fill (nested i&-i
        // climbs) then bulk clear reuses the SAME backing store, so arrayBuffers must not grow.
        for (let rr = 0; rr < 32; rr++) for (let cc = 0; cc < 32; cc++) abF2.update(rr, cc, (rr * 32 + cc) & 0xffff);
        abF2.clear();
        // SegmentTree2D: one flat Float64Array, fixed at construction. A full grid fill (nested
        // iterative col-tree + row-tree climbs) then bulk clear reuses the SAME backing store, so
        // arrayBuffers must not grow across soak cycles.
        for (let rr = 0; rr < 32; rr++) for (let cc = 0; cc < 32; cc++) abSt2.update(rr, cc, (rr * 32 + cc) & 0xffff);
        abSt2.clear();
        // SortedArray: two fixed Float64Arrays, no free-list. A SCATTERED fill (each insert is an O(n)
        // copyWithin shift), then a scattered delete round on half (O(n) shift down), then a refill,
        // then bulk clear -- all IN PLACE, so arrayBuffers must not grow across soak cycles (a botched
        // shift that reallocated the backing store would grow it here).
        for (let i = 0; i < 1024; i++) abSa.set((i * 2654435761) & 1023, i); // scattered -> shift-heavy
        for (let i = 0; i < 512; i++) abSa.delete((i * 2654435761) & 1023);
        for (let i = 0; i < 512; i++) abSa.set((i * 2654435761) & 1023, i);
        abSa.clear();
        // PersistentSegTree: three fixed node columns + a fixed _roots array, no free-list. A full
        // version arena of path-copying updates (each bump-allocates preallocated slots), then a
        // clear() that rewinds the bump cursor + re-seeds v0 IN PLACE -- so arrayBuffers must not grow
        // across soak cycles (a botched grow-on-demand would reallocate a column and grow it here).
        let abpv = 0;
        for (let v = 0; v < 256; v++) abpv = abPst.update((v & 3) ? abpv : 0, (v * 2654435761) & 1023, v & 0xffff);
        if (abPst.versions !== 257) conservationOk = false;   // v0 .. v256, dense
        if (abPst.query(abpv, 0, 1023) < 0) conservationOk = false; // reachable head stays queryable
        abPst.clear();
        if (abPst.versions !== 1 || abPst._next !== 1 + (2 * 1024 - 1)) conservationOk = false; // rewound
        // MergeSortTree: IMMUTABLE, so it has no fill/clear cycle -- a batch of read-only range-rank
        // queries over the pre-built tree instead. Reads never grow the flat _t table (a botched
        // grow-on-read would reallocate it here). The result must stay in [0, length] every call.
        for (let i = 0; i < 1024; i++) {
            const c = abMst.countLE(0, 1023, i & 0xffff);
            if (c < 0 || c > 1024) conservationOk = false;
        }
        // WaveletTree: IMMUTABLE, so it has no fill/clear cycle -- a batch of read-only queries over the
        // pre-built matrix instead. Reads never grow the flat bitvector table (a botched grow-on-read
        // would reallocate it here). Each result must stay within its structural bounds every call:
        // quantile / access return a stored value; rangeCount stays in [0, 1024]; select is a valid index
        // or undefined; and select is the exact inverse of rank (a round-trip conservation check).
        for (let i = 0; i < 1024; i++) {
            const q = abWt.quantile(0, 1023, i & 1023);
            if (q < 0 || q > 1023) conservationOk = false;
            const rc = abWt.rangeCount(0, 1023, 0, i & 1023);
            if (rc < 0 || rc > 1024) conservationOk = false;
            const idx = abWt.select(i & 1023, 0);
            if (idx !== undefined && abWt.rank(i & 1023, idx) !== 0) conservationOk = false; // select/rank inverse
        }
        // CartesianTree: IMMUTABLE, so it has no fill/clear cycle -- a batch of read-only queries over the
        // pre-built tree instead. Reads never grow the flat structural arrays (a botched grow-on-read would
        // reallocate here). rangeMinIndex must return an index inside the queried window, and rangeMin must
        // equal at(rangeMinIndex) -- a round-trip conservation check.
        for (let i = 0; i < 1024; i++) {
            const lo = i & 511, hi = lo + 512;
            const mi = abCt.rangeMinIndex(lo, hi);
            if (mi < lo || mi > hi) conservationOk = false;
            if (abCt.rangeMin(lo, hi) !== abCt.at(mi)) conservationOk = false;
        }
        // SplayTree: same free-list conservation contract as SkipList/Treap. A fill (each
        // insert splays), then a real delete() -> splay-join -> _pool.free() round trip on
        // half the slots, then a refill (splaying), then clear -- the invariant must hold
        // after each phase (a splay/join that leaked or double-freed a slot would break it).
        for (let i = 0; i < 1024; i++) abSp.set((i * 2654435761) & 1023, i);
        if (abSp._pool.activeSlots + abSp._pool.freeListLength !== abSp._pool.capacity) conservationOk = false;
        for (let i = 0; i < 512; i++) abSp.delete((i * 2654435761) & 1023);
        if (abSp._pool.activeSlots + abSp._pool.freeListLength !== abSp._pool.capacity) conservationOk = false;
        for (let i = 0; i < 512; i++) abSp.set((i * 2654435761) & 1023, i);
        if (abSp._pool.activeSlots + abSp._pool.freeListLength !== abSp._pool.capacity) conservationOk = false;
        abSp.clear();
        if (abSp._pool.activeSlots + abSp._pool.freeListLength !== abSp._pool.capacity) conservationOk = false;
        // BinomialHeap (standalone): same free-list conservation contract. A full fill (each push
        // is a binary carry that links/frees no slots), then a real popMin() -> child-reverse +
        // remeld + slot free round trip on half, then a refill, then clear() -> forest walk that
        // frees every own node -- the invariant must hold after each phase.
        for (let i = 0; i < 1024; i++) abBinh.push(i & 0xffff, (i * 2654435761) & 0xffff);
        if (abBinh._pool.activeSlots + abBinh._pool.freeListLength !== abBinh._pool.capacity || abBinh._pool.activeSlots !== 1024) conservationOk = false;
        for (let i = 0; i < 512; i++) abBinh.popMin();
        if (abBinh._pool.activeSlots + abBinh._pool.freeListLength !== abBinh._pool.capacity || abBinh._pool.activeSlots !== 512) conservationOk = false;
        for (let i = 0; i < 512; i++) abBinh.push(i & 0xffff, (i * 40503) & 0xffff);
        if (abBinh._pool.activeSlots + abBinh._pool.freeListLength !== abBinh._pool.capacity) conservationOk = false;
        abBinh.clear();
        if (abBinh._pool.activeSlots + abBinh._pool.freeListLength !== abBinh._pool.capacity || abBinh._pool.activeSlots !== 0) conservationOk = false;
        // CONSERVATION ACROSS MELD (the top-risk block): fill two arena-siblings, meld, and assert
        // nodes MOVE between root lists but NEVER between pools -- activeSlots is unchanged by the
        // meld, size is the exact sum, and a full drain returns every slot. The donor is refreshed
        // in place (white-box, alloc-free) since meld consumes it (a reused donor fails closed).
        abMeldDonor._consumed = false; abMeldDonor._head = 0; abMeldDonor._min = 0; abMeldDonor._n = 0;
        for (let i = 0; i < 256; i++) abMeldAcc.push(i & 0xffff, (i * 2654435761) & 0xffff);
        for (let i = 0; i < 256; i++) abMeldDonor.push((i + 256) & 0xffff, (i * 40503) & 0xffff);
        const beforeMeldActive = abMeldAcc._pool.activeSlots; // 512 nodes across the two heaps
        if (beforeMeldActive !== 512) conservationOk = false;
        abMeldAcc.meld(abMeldDonor); // consumes donor; roots relink, pools untouched
        if (abMeldAcc._pool.activeSlots !== beforeMeldActive) conservationOk = false;       // no pool churn
        if (abMeldAcc._pool.activeSlots + abMeldAcc._pool.freeListLength !== abMeldAcc._pool.capacity) conservationOk = false;
        if (abMeldAcc.size !== 512 || abMeldDonor.size !== 0) conservationOk = false;        // size conserved; donor emptied
        let melded = 0; while (abMeldAcc.size > 0) { abMeldAcc.popMin(); melded++; }
        if (melded !== 512) conservationOk = false;                                          // every node drained in order
        if (abMeldAcc._pool.activeSlots !== 0) conservationOk = false;                        // every slot returned
        if (abMeldAcc._pool.activeSlots + abMeldAcc._pool.freeListLength !== abMeldAcc._pool.capacity) conservationOk = false;
        // PairingHeap (standalone): same free-list conservation contract, PLUS the addressable
        // decreaseKey/remove paths. A full fill (each push is an O(1) root-link, frees no slots),
        // then a decreaseKey round on half (cut + link, frees nothing), then a real remove() round
        // on half (cut + two-pass-combine children + slot free), then a refill, then clear() -> a
        // forest walk that frees every own node -- the invariant must hold after each phase.
        for (let i = 0; i < 1024; i++) abPh.push(i, (i * 2654435761) & 0xffff);
        if (abPh._pool.activeSlots + abPh._pool.freeListLength !== abPh._pool.capacity || abPh._pool.activeSlots !== 1024) conservationOk = false;
        for (let i = 0; i < 512; i++) abPh.decreaseKey(i, -(i + 1)); // cut + link, no pool churn
        if (abPh._pool.activeSlots !== 1024) conservationOk = false;
        for (let i = 0; i < 512; i++) abPh.remove(i);
        if (abPh._pool.activeSlots + abPh._pool.freeListLength !== abPh._pool.capacity || abPh._pool.activeSlots !== 512) conservationOk = false;
        for (let i = 0; i < 512; i++) abPh.push(i, (i * 40503) & 0xffff);
        if (abPh._pool.activeSlots + abPh._pool.freeListLength !== abPh._pool.capacity) conservationOk = false;
        abPh.clear();
        if (abPh._pool.activeSlots + abPh._pool.freeListLength !== abPh._pool.capacity || abPh._pool.activeSlots !== 0) conservationOk = false;
        // CONSERVATION ACROSS MELD for PairingHeap's O(1) meld: fill two arena-siblings, meld, and
        // assert nodes MOVE root lists but NEVER pools -- activeSlots unchanged, size the exact sum,
        // the melded-in ids reprioritizable via the surviving heap (the addressable contract), and a
        // full drain returns every slot. The donor is refreshed in place (alloc-free) each round.
        abPhMeldDonor._consumed = false; abPhMeldDonor._root = 0; abPhMeldDonor._n = 0; abPhMeldDonor._alias[abPhMeldDonor._hid] = abPhMeldDonor._hid;
        for (let i = 0; i < 256; i++) abPhMeldAcc.push(i, (i * 2654435761) & 0xffff);
        for (let i = 256; i < 512; i++) abPhMeldDonor.push(i, (i * 40503) & 0xffff);
        const beforePhMeldActive = abPhMeldAcc._pool.activeSlots; // 512 nodes across the two heaps
        if (beforePhMeldActive !== 512) conservationOk = false;
        abPhMeldAcc.meld(abPhMeldDonor); // consumes donor; single root-link + alias, pools untouched
        if (abPhMeldAcc._pool.activeSlots !== beforePhMeldActive) conservationOk = false;     // no pool churn
        if (abPhMeldAcc._pool.activeSlots + abPhMeldAcc._pool.freeListLength !== abPhMeldAcc._pool.capacity) conservationOk = false;
        if (abPhMeldAcc.size !== 512 || abPhMeldDonor.size !== 0) conservationOk = false;      // size conserved; donor emptied
        abPhMeldAcc.decreaseKey(400, -1); // a melded-in id is now the acc's -> reprioritizable
        if (abPhMeldAcc.peekMin() !== 400) conservationOk = false;                             // reached the root
        let phMelded = 0; while (abPhMeldAcc.size > 0) { abPhMeldAcc.popMin(); phMelded++; }
        if (phMelded !== 512) conservationOk = false;                                          // every node drained
        if (abPhMeldAcc._pool.activeSlots !== 0) conservationOk = false;                       // every slot returned
        if (abPhMeldAcc._pool.activeSlots + abPhMeldAcc._pool.freeListLength !== abPhMeldAcc._pool.capacity) conservationOk = false;
        // FibonacciHeap (standalone): same free-list conservation contract, PLUS the addressable
        // decreaseKey/remove paths. A full fill (each push is an O(1) root splice, frees no slots),
        // then a decreaseKey round on half (cut + cascade, frees nothing), then a real remove() round
        // on half (cut + cascade + splice-children consolidation + slot free), then a refill, then
        // clear() -> a forest walk that frees every own node -- the invariant must hold after each phase.
        for (let i = 0; i < 1024; i++) abFh.push(i, (i * 2654435761) & 0xffff);
        if (abFh._pool.activeSlots + abFh._pool.freeListLength !== abFh._pool.capacity || abFh._pool.activeSlots !== 1024) conservationOk = false;
        for (let i = 0; i < 512; i++) abFh.decreaseKey(i, -(i + 1)); // cut + cascade, no pool churn
        if (abFh._pool.activeSlots !== 1024) conservationOk = false;
        for (let i = 0; i < 512; i++) abFh.remove(i);
        if (abFh._pool.activeSlots + abFh._pool.freeListLength !== abFh._pool.capacity || abFh._pool.activeSlots !== 512) conservationOk = false;
        for (let i = 0; i < 512; i++) abFh.push(i, (i * 40503) & 0xffff);
        if (abFh._pool.activeSlots + abFh._pool.freeListLength !== abFh._pool.capacity) conservationOk = false;
        abFh.clear();
        if (abFh._pool.activeSlots + abFh._pool.freeListLength !== abFh._pool.capacity || abFh._pool.activeSlots !== 0) conservationOk = false;
        // CONSERVATION ACROSS MELD for FibonacciHeap's O(1) meld: fill two arena-siblings, meld, and
        // assert nodes MOVE root lists but NEVER pools -- activeSlots unchanged, size the exact sum,
        // the melded-in ids reprioritizable via the surviving heap (the addressable contract), and a
        // full drain returns every slot. The donor is refreshed in place (alloc-free) each round.
        abFhMeldDonor._consumed = false; abFhMeldDonor._min = 0; abFhMeldDonor._n = 0; abFhMeldDonor._alias[abFhMeldDonor._hid] = abFhMeldDonor._hid;
        for (let i = 0; i < 256; i++) abFhMeldAcc.push(i, (i * 2654435761) & 0xffff);
        for (let i = 256; i < 512; i++) abFhMeldDonor.push(i, (i * 40503) & 0xffff);
        const beforeFhMeldActive = abFhMeldAcc._pool.activeSlots; // 512 nodes across the two heaps
        if (beforeFhMeldActive !== 512) conservationOk = false;
        abFhMeldAcc.meld(abFhMeldDonor); // consumes donor; circular-list concat + alias, pools untouched
        if (abFhMeldAcc._pool.activeSlots !== beforeFhMeldActive) conservationOk = false;     // no pool churn
        if (abFhMeldAcc._pool.activeSlots + abFhMeldAcc._pool.freeListLength !== abFhMeldAcc._pool.capacity) conservationOk = false;
        if (abFhMeldAcc.size !== 512 || abFhMeldDonor.size !== 0) conservationOk = false;      // size conserved; donor emptied
        abFhMeldAcc.decreaseKey(400, -1); // a melded-in id is now the acc's -> reprioritizable
        if (abFhMeldAcc.peekMin() !== 400) conservationOk = false;                             // reached the extreme
        let fhMelded = 0; while (abFhMeldAcc.size > 0) { abFhMeldAcc.popMin(); fhMelded++; }
        if (fhMelded !== 512) conservationOk = false;                                          // every node drained
        if (abFhMeldAcc._pool.activeSlots !== 0) conservationOk = false;                       // every slot returned
        if (abFhMeldAcc._pool.activeSlots + abFhMeldAcc._pool.freeListLength !== abFhMeldAcc._pool.capacity) conservationOk = false;
        // LinkCutTree: EDGE conservation across a dynamic-forest churn. A batch of cut-then-re-link rounds
        // (evert the parent to expose the child's parent edge, cut it, re-link the same edge) flips edges IN
        // PLACE -- so the edge count returns to the chain's 1023 and the backing stores never grow. A botched
        // link/cut that leaked or double-counted an edge (or reallocated a column) would break it here.
        for (let i = 1; i < 512; i++) {
            const x = i, p = i - 1;
            abLct.evert(p);                                   // root at p so x's parent edge is p
            abLct.cut(x);
            if (abLct.edges !== 1022) conservationOk = false; // exactly one edge removed
            abLct.link(x, p);
            if (abLct.edges !== 1023) conservationOk = false; // and restored
        }
        if (abLct.edges !== 1023) conservationOk = false;     // chain fully conserved after the churn round
        if (abLct.connected(0, 1023) !== true) conservationOk = false; // still one connected tree
        for (let i = 0; i < 256; i++) {                       // read-only path folds never grow a column
            const a = abLct.pathAggregate(i & 1023, (i * 3 + 1) & 1023);
            if (!Number.isFinite(a)) conservationOk = false;
        }
    }
    globalThis.gc();
    const abAfter = process.memoryUsage().arrayBuffers;
    const abDelta = abAfter - abBefore;
    const abOk = abDelta <= 0;

    // ---- verdict + GATE line ----------------------------------------------
    const ok = report.ok && live === 0 && leaks.length === 0 &&
        findings.length === 0 && allocOk && controlOk && abOk && conservationOk;

    console.log(
        'GATE leak=size ' + live + '/0 findings=' + findings.length +
        ' warnings=' + warns.length +
        ' | gc major=' + s2.gc.major + ' minor=' + s2.gc.minor +
        ' maxMs=' + s2.gc.maxMs.toFixed(2) +
        ' | alloc=' + allocBytes + ' B/op' +
        ' | ' + (ok ? 'ok' : 'FAIL') +
        ' (BinaryHeap + Fenwick + SegmentTree + SkipList + Treap + Scapegoat + MinMaxHeap + SplayTree + BinomialHeap + PairingHeap + FibonacciHeap + Fenwick2D + SegmentTree2D + SortedArray + PersistentSegTree + MergeSortTree + WaveletTree + CartesianTree + LinkCutTree; control=' + controlBytes + ' B/op sink=' + sink +
        ' abGrowth=' + abDelta + ' conservation=' + (conservationOk ? 'ok' : 'FAIL') + ')');

    if (!ok) {
        for (const v of report.violations) {
            console.error('  violation ' + v.metric + ' limit=' + v.limit + ' actual=' + v.actual);
        }
        for (const f of findings) console.error('  finding ' + f.kind + ':' + f.reason);
        for (const l of leaks) console.error('  leak ' + l);
        if (!allocOk) console.error('  alloc ' + allocBytes + ' B/op on a hot lane (expected 0)');
        if (!controlOk) console.error('  control lane read ' + controlBytes + ' B/op (expected > 0 -- instrument is blind)');
        if (!abOk) console.error('  arrayBuffers growth ' + abDelta + ' (expected <= 0)');
        if (!conservationOk) console.error('  SkipList conservation invariant broke (activeSlots + freeListLength !== capacity)');
        process.exitCode = 1;
    }
}

main();
