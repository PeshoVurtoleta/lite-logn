/**
 * @zakkster/lite-logn -- the KIND-crossed allocation GATE (stage G, v1.4.0).
 *
 *   node --expose-gc --max-semi-space-size=4 --min-semi-space-size=4 \
 *        --no-concurrent-recompilation --test test/perf/Kinds.test.mjs
 *
 * A per-SHARD node:test gate over test/perf/Kinds.mjs. The shard is chosen by the
 * LOGN_SHARD env var (default 'lct'); test/perf/Lanes.mjs (G6) spawns one child per
 * shard, in parallel, with the flags above (the noinline shard adds
 * --max-inlined-bytecode-size=0). Those flags are ASSERTED here (a shard run without
 * a pinned new-space or with concurrent recompilation is not trustworthy).
 *
 * MEASUREMENT IS SEQUENTIAL. The scavenge counter and the sink are process-global,
 * so every measurement runs to completion in a single top-level-await pass BEFORE
 * any test registers; the `test()` blocks are pure assertions over the readings.
 *
 * SELF-CALIBRATION (G5) + DRIFT GUARD (reviewer blocker 3; stage-G QA item 2).
 * teethOneBox is measured at the START (B1) and again at the END (B1late). Every lane
 * budget is applied from the CONSERVATIVE scale Bcalib = min(B1, B1late), so a downward
 * drift only tightens a budget. ZERO = 2; ONE = floor(1.5*Bcalib). The drift guard is
 * DERIVED from the registry's max k (Kinds.mjs DRIFT_GUARD = 0.15 at kMax=2; a k=3 lane
 * tightens it to 0.10), so box k+1 always fails at the worst admitted scale. The shard
 * FAILS if: B1 < 8; the end-of-shard scale DRIFTS by > DRIFT_GUARD; teethOneBox does not
 * exceed ZERO; or teethTwoBox (start OR end) does not exceed ONE (a fixed ONE of 32 would
 * let a two-box teeth ~24 pass -- hence self-calibration + the end-of-shard re-check).
 * For the lct-n2 shard the teeth is measured AFTER the N2 warm-up, so B1 reflects the
 * shard's own feedback state.
 *
 * On 1.3.0 the F3 / F4 / F10 lanes exceed budget and FAIL -- that RED is the stage-G
 * exit criterion, not a gate bug. Never widen a budget to make it pass.
 */

import test from 'node:test';
import assert from 'node:assert/strict';
import {
    measureRun, teethOneBox, teethOneBoxState, teethTwoBox, teethTwoBoxState,
    lanesForShard, kindsFor, expectedCells, budgetFor, budgetK, laneK, BOUNDARY, SHARDS, LANES,
    DRIFT_GUARD, deferralFor,
} from './Kinds.mjs';
import { parseFlags, pinnedSemiSpaceOk, noinlineOk } from './Flags.mjs';

const SHARD = process.env.LOGN_SHARD || 'lct';
const sh = SHARDS[SHARD];
if (!sh) throw new Error('[Kinds.test] unknown LOGN_SHARD: ' + String(SHARD));
const KIND_OVERRIDE = sh.kinds;
const IS_NOINLINE = SHARD.indexOf('ni-') === 0;
const CALIB_KIND = 'frac';                 // reliably one box/op (frac never a Smi)

// ---- flag audit (blocker 3a / 9; stage-G QA item 1): pinned new-space + single-tier
// compilation; ni- shards additionally require --max-inlined-bytecode-size=0. Parse
// execArgv the way V8 resolves it (normalize _/-, accept =value and space value, LAST
// occurrence wins), so a later --max-inlined-bytecode-size=460 or a later
// --concurrent-recompilation that UNDOES an earlier flag is caught -- a textual regex
// over the joined string would see only the first occurrence. ----
const FLAGS = process.execArgv.join(' ');
const FLAG_MAP = parseFlags(process.execArgv);
const flagOk = pinnedSemiSpaceOk(FLAG_MAP) && (!IS_NOINLINE || noinlineOk(FLAG_MAP));

// ---- sequential measurement pass (top-level await) --------------------------
// For lct-n2, warm the process into its N2 polymorphic state before calibrating.
if (SHARD === 'lct-n2') {
    const n2 = LANES.find((l) => l.warm === 'n2');
    await measureRun(n2.make, n2.run, 'frac');
}

const B1 = await measureRun(teethOneBoxState, teethOneBox, CALIB_KIND);
const ZERO_BUDGET = budgetK(0, B1);            // ROADMAP ZERO = 2; any box on a clean k=0 path fails
const teethOne2 = await measureRun(teethOneBoxState, teethOneBox, CALIB_KIND);
const teethTwo = await measureRun(teethTwoBoxState, teethTwoBox, CALIB_KIND);

process.stdout.write('CALIB\t' + SHARD + '\tB1=' + B1 + '\tZERO=' + ZERO_BUDGET + '\tONE=' + budgetK(1, B1) + '\tnoinline=' + IS_NOINLINE + '\tflags=' + (flagOk ? 'ok' : 'MISSING') + '\n');

// Measure every lane's scavenge count FIRST; the budget is applied afterwards from the
// CONSERVATIVE scale Bcalib = min(B1, B1late), so a downward drift can only TIGHTEN a
// budget, never loosen it (stage-G QA item 2).
const measured = [];
for (const lane of lanesForShard(SHARD)) {
    for (const kind of kindsFor(lane, KIND_OVERRIDE)) {
        const scav = await measureRun(lane.make, lane.run, kind);
        // Effective k the budget uses: a non-BOUNDARY lane in the normal shard is gated at
        // k=0 (default-safe), so record THAT (not the theoretical laneK) or the audit reads a
        // k the budget never applied.
        const k = (!IS_NOINLINE && !BOUNDARY.has(lane.id)) ? 0 : laneK(lane, kind, IS_NOINLINE);
        measured.push({ id: lane.id, kind, io: lane.io, k, scav });
    }
}

// Re-measure the teeth AFTER the lanes: the one-box scale must not have drifted.
const B1late = await measureRun(teethOneBoxState, teethOneBox, CALIB_KIND);
const twoLate = await measureRun(teethTwoBoxState, teethTwoBox, CALIB_KIND);
const BCALIB = Math.min(B1, B1late);           // conservative scale for every lane budget
const ONE_BUDGET = budgetK(1, BCALIB);         // the k=1 reference, for the teeth checks
process.stdout.write('CALIBEND\t' + SHARD + '\tB1late=' + B1late + '\ttwoLate=' + twoLate + '\n');

// Now derive budgets + verdicts from BCALIB, emit the LANE lines, and collect stale entries.
const rows = [];
const staleBoundary = [];
const staleDeferred = [];
for (const m of measured) {
    const budget = budgetK(m.k, BCALIB);
    const over = m.scav > budget;
    const defer = deferralFor(m.id, m.kind, SHARD);   // ROADMAP 8.4 DEFERRED policy
    // A DEFERRED cell: RED passes (printed as DEFER), GREEN fails ("remove from DEFERRED", so the
    // list only shrinks). A non-deferred cell: RED fails, GREEN passes.
    let verdict, pass;
    if (defer) {
        if (over) { verdict = 'DEFER'; pass = true; }
        else { verdict = 'UNDEFER'; pass = false; staleDeferred.push(m.id + ' [' + m.kind + '] is GREEN now (' + m.scav + ' <= ' + budget + '); remove from DEFERRED (' + defer + ')'); }
    } else {
        verdict = over ? 'FAIL' : 'PASS';
        pass = !over;
    }
    rows.push({ id: m.id, kind: m.kind, io: m.io, k: m.k, scav: m.scav, budget, pass, verdict, defer });
    // Blocker 3: a BOUNDARY lane that reads ~0 where it declares a boundary box (k>=1)
    // is a STALE entry (a gate hole) -- the k-budget would silently hide a regression.
    if (!IS_NOINLINE && BOUNDARY.has(m.id) && m.k >= 1 && m.scav <= 2) staleBoundary.push(m.id + ' [' + m.kind + '] reads ' + m.scav + ' but declares k=' + m.k);
    process.stdout.write(
        'LANE\t' + SHARD + '\t' + m.id + '\t' + m.kind + '\tk' + m.k + '\t' +
        m.scav + '\t' + budget + '\t' + verdict + (defer ? '\t' + defer : '') + '\n');
}

// ---- assertions -------------------------------------------------------------
test('flags: pinned new-space + --no-concurrent-recompilation present', () => {
    assert.ok(flagOk, 'shard ' + SHARD + ' missing a required flag; execArgv=' + FLAGS);
});
test('shard emits the expected cell count', () => {
    const exp = expectedCells(SHARD);
    assert.ok(rows.length === exp && exp > 0, 'shard ' + SHARD + ' emitted ' + rows.length + ' cells, expected ' + exp);
});
test('teeth calibration: B1 >= 8 (shard not GC-blind)', () => {
    assert.ok(B1 >= 8, 'shard ' + SHARD + ' GC-blind: teethOneBox B1=' + B1 + ' < 8 (fix the driver, not the budget)');
});
test('scale did not drift > DRIFT_GUARD across the shard', () => {
    const drift = Math.abs(B1late - B1);
    assert.ok(drift <= DRIFT_GUARD * B1, 'shard ' + SHARD + ' scale drifted > ' + (DRIFT_GUARD * 100) + '%: B1=' + B1 + ' -> B1late=' + B1late);
});
test('teeth: one box FAILS the ZERO budget (start)', () => {
    assert.ok(teethOne2 > ZERO_BUDGET, 'teethOneBox read ' + teethOne2 + ' <= ZERO ' + ZERO_BUDGET + ' -- gate is blind');
});
test('teeth: two boxes FAIL the ONE budget (start)', () => {
    assert.ok(teethTwo > ONE_BUDGET, 'teethTwoBox(start) read ' + teethTwo + ' <= ONE ' + ONE_BUDGET + ' -- ONE too loose');
});
test('teeth: two boxes FAIL the ONE budget (end-of-shard)', () => {
    assert.ok(twoLate > ONE_BUDGET, 'teethTwoBox(end) read ' + twoLate + ' <= ONE ' + ONE_BUDGET + ' -- ONE drifted loose');
});
test('no stale BOUNDARY entries (a k>=1 boundary lane that reads ~0 is a gate hole)', () => {
    assert.ok(staleBoundary.length === 0, 'stale BOUNDARY (remove from the set or fix the lane): ' + staleBoundary.join(' | '));
});
test('no stale DEFERRED entries (a deferred lane that is GREEN must be removed)', () => {
    assert.ok(staleDeferred.length === 0, 'DEFERRED list must only shrink: ' + staleDeferred.join(' | '));
});
for (const r of rows) {
    const label = r.defer ? ' [DEFER ' + r.defer + ']' : '';
    test(r.id + ' [' + r.kind + '] ' + r.io + label, () => {
        assert.ok(r.pass,
            r.id + ' [' + r.kind + '] read ' + r.scav + ' scavenges > budget ' + r.budget +
            ' (' + r.io + ')' + (r.verdict === 'UNDEFER'
                ? '; it is GREEN now -- remove from DEFERRED (' + r.defer + ').'
                : '. Fix the code, never the budget.'));
    });
}
