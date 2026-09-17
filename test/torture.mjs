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
 * v0.1.0 ships BinaryHeap; v0.2.0 adds Fenwick. Phase 1 (retention) tracks a
 * fresh heap AND a fresh Fenwick per churn cycle -- the cleanup closes over
 * NOTHING (the held-value contract), so both finalize and tracker.size() returns
 * to 0. Phase 2 steps a single out-of-loop heap (push / pop / changeKey / remove)
 * and a single out-of-loop Fenwick (update / prefix / at / rangeSum / set /
 * forEach) and gates 0 B/op via measureAllocs -- a deliberately-allocating
 * CONTROL lane must report > 0 bytes, proving the instrument has teeth. It then
 * profiles a steady churn window mixing both members for gc major = 0, and
 * asserts the backing arrayBuffers do not grow across fill/clear cycles for
 * either member.
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
    const { VERSION, BinaryHeap, Fenwick } = await import('../LogN.js');

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
        stepUpdate, stepPrefix, stepAt, stepRangeSum, stepSet]) {
        const r = measureAllocs(step, { iterations: 100000, batches: 8 });
        const bpc = r.bytesPerCall === null ? 0 : r.bytesPerCall;
        const b = Math.max(0, Math.round(bpc));
        if (b > allocBytes) allocBytes = b;
    }
    // forEach is O(n log n) per call (n = CAP = 4096) -- a far heavier body than
    // the O(log n) lanes above, so it gets its own (smaller) iteration budget.
    // The gate is identical: 0 B/op or the whole verdict fails.
    {
        const r = measureAllocs(stepForEach, { iterations: 3000, batches: 8 });
        const bpc = r.bytesPerCall === null ? 0 : r.bytesPerCall;
        const b = Math.max(0, Math.round(bpc));
        if (b > allocBytes) allocBytes = b;
    }
    if (racc === 0x7fffffff) throw new Error('unreachable'); // keep racc live
    if (facc === 0x7fffffff) throw new Error('unreachable'); // keep facc live
    if (feAcc === 0x7fffffff) throw new Error('unreachable'); // keep feAcc live
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
    globalThis.gc();
    await new Promise((r) => setTimeout(r, 50));
    globalThis.gc();
    const abBefore = process.memoryUsage().arrayBuffers;
    for (let r = 0; r < 2000; r++) {
        for (let i = 0; i < 1024; i++) abHeap.push(i, (i * 2654435761) & 0xffff);
        abHeap.clear();
        for (let i = 0; i < 1024; i++) abFen.update(i, (i * 2654435761) & 0xffff);
        abFen.clear();
    }
    globalThis.gc();
    const abAfter = process.memoryUsage().arrayBuffers;
    const abDelta = abAfter - abBefore;
    const abOk = abDelta <= 0;

    // ---- verdict + GATE line ----------------------------------------------
    const ok = report.ok && live === 0 && leaks.length === 0 &&
        findings.length === 0 && allocOk && controlOk && abOk;

    console.log(
        'GATE leak=size ' + live + '/0 findings=' + findings.length +
        ' warnings=' + warns.length +
        ' | gc major=' + s2.gc.major + ' minor=' + s2.gc.minor +
        ' maxMs=' + s2.gc.maxMs.toFixed(2) +
        ' | alloc=' + allocBytes + ' B/op' +
        ' | ' + (ok ? 'ok' : 'FAIL') +
        ' (BinaryHeap + Fenwick; control=' + controlBytes + ' B/op sink=' + sink +
        ' abGrowth=' + abDelta + ')');

    if (!ok) {
        for (const v of report.violations) {
            console.error('  violation ' + v.metric + ' limit=' + v.limit + ' actual=' + v.actual);
        }
        for (const f of findings) console.error('  finding ' + f.kind + ':' + f.reason);
        for (const l of leaks) console.error('  leak ' + l);
        if (!allocOk) console.error('  alloc ' + allocBytes + ' B/op on a hot lane (expected 0)');
        if (!controlOk) console.error('  control lane read ' + controlBytes + ' B/op (expected > 0 -- instrument is blind)');
        if (!abOk) console.error('  arrayBuffers growth ' + abDelta + ' (expected <= 0)');
        process.exitCode = 1;
    }
}

main();
