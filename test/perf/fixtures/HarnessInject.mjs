/**
 * @zakkster/lite-logn -- QA injection module for test/perf/Harness.test.mjs.
 *
 * Loaded by test/perf/Kinds.mjs ONLY when LOGN_INJECT names this file (default off;
 * Lanes.mjs strips LOGN_INJECT from every child). Adds scratch shards whose lanes box a
 * KNOWN number of HeapNumbers per op, the same way the G3 teeth do (a double stored into
 * a PACKED_ELEMENTS array held by the lane state), so every gate verdict is predictable.
 * None of these lanes touch LogN.js.
 *
 * REPO-ONLY dev infra: not in package.json files[].
 */

export default function inject(ctx) {
    const { LANES, BOUNDARY, SIG, SHARDS, MEASURE_FLAGS, NOINLINE_FLAGS, CHUNK, INMASK, SINKMASK, DEFERRED } = ctx;
    const boxState = () => ({ box: [{}, {}, {}] });

    // n boxes per op (n = 0..3), every op.
    const box0 = (st, IN, base, sink, si) => { let a = 0; for (let j = 0; j < CHUNK; j++) { const t = (base + j) | 0; a += IN[t & INMASK]; } sink[si & SINKMASK] = a; };
    const box1 = (st, IN, base, sink, si) => { const b = st.box; let a = 0; for (let j = 0; j < CHUNK; j++) { const t = (base + j) | 0; b[0] = IN[t & INMASK]; a += b[0]; } sink[si & SINKMASK] = a; };
    const box2 = (st, IN, base, sink, si) => { const b = st.box; let a = 0; for (let j = 0; j < CHUNK; j++) { const t = (base + j) | 0; b[0] = IN[t & INMASK]; b[1] = IN[(t + 1) & INMASK]; a += b[0] + b[1]; } sink[si & SINKMASK] = a; };
    const box3 = (st, IN, base, sink, si) => { const b = st.box; let a = 0; for (let j = 0; j < CHUNK; j++) { const t = (base + j) | 0; b[0] = IN[t & INMASK]; b[1] = IN[(t + 1) & INMASK]; b[2] = IN[(t + 2) & INMASK]; a += b[0] + b[1] + b[2]; } sink[si & SINKMASK] = a; };
    // one box every other op / every third op.
    const boxHalf = (st, IN, base, sink, si) => { const b = st.box; let a = 0; for (let j = 0; j < CHUNK; j++) { const t = (base + j) | 0; if ((j & 1) === 0) b[0] = IN[t & INMASK]; a += t; } sink[si & SINKMASK] = a + b[0]; };
    const boxThird = (st, IN, base, sink, si) => { const b = st.box; let a = 0; for (let j = 0; j < CHUNK; j++) { const t = (base + j) | 0; if (j % 3 === 0) b[0] = IN[t & INMASK]; a += t; } sink[si & SINKMASK] = a + b[0]; };

    const lane = (id, group, run, make) => ({ id, io: 'doubleIO', group, kinds: ['frac'], make: make || boxState, run });

    // ---- shard inj: the budget matrix (normal shard) ----
    LANES.push(
        lane('Inj.clean', 'inj', box0),            // k0, not BOUNDARY, 0 box   -> GREEN (control)
        lane('Inj.oneBox', 'inj', box1),           // k0, not BOUNDARY, 1 box   -> RED   (a)
        lane('Inj.halfBox', 'inj', boxHalf),       // k0, 1 box / 2 ops (~6)    -> RED   (b)
        lane('Inj.thirdBox', 'inj', boxThird),     // k0, 1 box / 3 ops (~4)    -> RED   (b, adversarial)
        lane('Inj.k1exact', 'inj', box1),          // BOUNDARY k1, 1 box        -> GREEN (c)
        lane('Inj.k1over', 'inj', box2),           // BOUNDARY k1, 2 boxes      -> RED   (c)
        lane('Inj.k2exact', 'inj', box2),          // BOUNDARY k2, 2 boxes      -> GREEN (c)
        lane('Inj.k2over', 'inj', box3),           // BOUNDARY k2, 3 boxes      -> RED   (c)
    );
    SIG['Inj.k1exact'] = [1, 'none'];
    SIG['Inj.k1over'] = [1, 'none'];
    SIG['Inj.k2exact'] = [2, 'none'];
    SIG['Inj.k2over'] = [2, 'none'];
    BOUNDARY.add('Inj.k1exact'); BOUNDARY.add('Inj.k1over');
    BOUNDARY.add('Inj.k2exact'); BOUNDARY.add('Inj.k2over');
    SHARDS['inj'] = { groups: ['inj'], flags: MEASURE_FLAGS.slice() };

    // ---- shard inj-stale: a k1 BOUNDARY lane that reads 0 -> stale check fails (d) ----
    LANES.push(lane('Inj.staleK1', 'inj-stale', box0));
    SIG['Inj.staleK1'] = [1, 'none'];
    BOUNDARY.add('Inj.staleK1');
    SHARDS['inj-stale'] = { groups: ['inj-stale'], flags: MEASURE_FLAGS.slice() };

    // ---- shard inj-tiny: one clean lane, for the flag audits (g) ----
    LANES.push(lane('Inj.tinyClean', 'inj-tiny', box0));
    SHARDS['inj-tiny'] = { groups: ['inj-tiny'], flags: MEASURE_FLAGS.slice() };

    // ---- shard ni-inj: a k1 lane under the noinline contract (f) ----
    LANES.push(lane('Inj.niK1', 'ni-inj', box1));
    SIG['Inj.niK1'] = [1, 'none'];
    SHARDS['ni-inj'] = { groups: ['ni-inj'], flags: NOINLINE_FLAGS.slice() };

    // ---- shard inj-drift: a lane whose make() starts a BACKGROUND allocator (an
    // unref'd 2 ms interval churning ~6 MB of young objects per tick). Every later
    // measurement window -- including the end-of-shard teeth -- counts the scavenges it
    // causes during the settle flush, so B1late drifts far above B1 (h). ----
    const driftMake = () => {
        const hold = { junk: null };
        const iv = setInterval(() => {
            const arr = new Array(262144);
            for (let i = 0; i < 262144; i++) arr[i] = { v: i };
            hold.junk = arr;
        }, 2);
        iv.unref();
        return boxState();
    };
    LANES.push(lane('Inj.driftBg', 'inj-drift', box0, driftMake));
    SHARDS['inj-drift'] = { groups: ['inj-drift'], flags: MEASURE_FLAGS.slice() };

    // ---- shard inj-defer: the DEFERRED semantics (ROADMAP 8.4) --------------------
    //   Inj.deferRed   -- 1 box (k0) -> RED, but DEFERRED    -> PASS, verdict DEFER   (i)
    //   Inj.deferGreen -- 0 box      -> GREEN, but DEFERRED  -> FAIL, verdict UNDEFER (j)
    //   Inj.undeferRed -- 1 box (k0) -> RED, NOT deferred    -> FAIL, verdict FAIL    (k)
    LANES.push(
        lane('Inj.deferRed', 'inj-defer', box1),
        lane('Inj.deferGreen', 'inj-defer', box0),
        lane('Inj.undeferRed', 'inj-defer', box1),
    );
    SHARDS['inj-defer'] = { groups: ['inj-defer'], flags: MEASURE_FLAGS.slice() };
    if (DEFERRED) {
        DEFERRED.set('Inj.deferRed|frac|inj-defer', 'FX');
        DEFERRED.set('Inj.deferGreen|frac|inj-defer', 'FX');
    }
}
