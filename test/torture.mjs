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
    const { VERSION, BinaryHeap, Fenwick, SegmentTree, SkipList, Treap, Scapegoat, MinMaxHeap, SplayTree } = await import('../LogN.js');

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
        stepSpGet, stepSpWorkingSet, stepSpSet, stepSpDelete, stepSpSuccessor]) {
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
        stepScForEach, stepScRangeIter, stepSpForEach, stepSpRangeIter]) {
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
        ' (BinaryHeap + Fenwick + SegmentTree + SkipList + Treap + Scapegoat + MinMaxHeap + SplayTree; control=' + controlBytes + ' B/op sink=' + sink +
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
