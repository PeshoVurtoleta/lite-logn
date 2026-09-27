/**
 * @zakkster/lite-logn -- SELF-TESTS of the stage-G allocation gate harness.
 *
 *   npm run test:perf:harness      (node --test test/perf/Harness.test.mjs; in `verify`)
 *
 * The Kinds gate (Kinds.mjs / Kinds.test.mjs / Lanes.mjs) is code too. This file proves
 * its boundary behavior with scratch lanes whose box count is KNOWN (they box the way
 * the G3 teeth do and never touch LogN.js), injected through the default-off
 * LOGN_INJECT hook (fixtures/HarnessInject.mjs), plus a fake shard
 * (fixtures/FakeShard.mjs) run through Lanes.mjs's default-off LOGN_LANES_SELFTEST hook.
 *
 *   (a) a lane that boxes once per op, normal shard, no BOUNDARY entry     -> RED
 *   (b) a lane that boxes every other op (and every third op)              -> RED (ZERO = 2)
 *   (c) a BOUNDARY lane reading k+1 boxes -> RED; exactly k boxes -> GREEN (k = 1, 2)
 *   (d) a stale BOUNDARY entry (k >= 1, reads 0) fails the stale check
 *   (e) a shard missing CALIB / CALIBEND, emitting 0 lanes or the wrong count -> Lanes fails
 *   (f) an ni- shard without --max-inlined-bytecode-size=0 fails its flag assert
 *   (g) a shard without the pinned semi-space fails its flag assert
 *   (h) a B1 that drifts more than DRIFT_GUARD (15% at kMax=2) across the shard fails
 * plus static checks of the S7k budget math and of the G-EXIT record against the registry.
 *
 * Every child is spawned up front, in parallel; the tests are assertions over the output.
 * REPO-ONLY dev infra: not in package.json files[].
 */

import test from 'node:test';
import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import path from 'node:path';
import fs from 'node:fs';
import {
    budgetK, laneK, budgetFor, BOUNDARY, LANES, SHARDS, SHARDS_KINDS, SHARDS_NOINLINE,
    expectedCells, INJECTED, DRIFT_GUARD, driftGuardFor, registryKMax, staleZeroBoundary,
} from './Kinds.mjs';
import { computeDiff } from './RedDiff.mjs';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(HERE, '..', '..');
const INJECT = path.join(HERE, 'fixtures', 'HarnessInject.mjs');
const FAKE = path.join(HERE, 'fixtures', 'FakeShard.mjs');
const KINDS_TEST = 'test/perf/Kinds.test.mjs';
const LANES_JS = 'test/perf/Lanes.mjs';

const MAXS = '--max-semi-space-size=4';
const MINS = '--min-semi-space-size=4';
const NCR = '--no-concurrent-recompilation';
const NOINL = '--max-inlined-bytecode-size=0';
const PIN = [MAXS, MINS, NCR];

function run(args, env, timeoutMs) {
    return new Promise((resolve) => {
        const envAll = { ...process.env, ...env };
        delete envAll.NODE_TEST_CONTEXT;               // the child is its own test run
        for (const k of Object.keys(env)) if (env[k] === undefined) delete envAll[k];
        const child = spawn(process.execPath, args, { cwd: ROOT, env: envAll, stdio: ['ignore', 'pipe', 'pipe'] });
        let out = '', err = '', timedOut = false;
        // Timeout guard: if the torture re-exec ever loops (an override survives the strip),
        // this kills the whole tree instead of hanging the harness. A pass must finish well
        // under it. SIGKILL the group so nested re-execs die too.
        const timer = timeoutMs ? setTimeout(() => { timedOut = true; try { child.kill('SIGKILL'); } catch { /* gone */ } }, timeoutMs) : null;
        child.stdout.on('data', (d) => { out += d; });
        child.stderr.on('data', (d) => { err += d; });
        child.on('close', (code) => { if (timer) clearTimeout(timer); resolve({ code, out, err, timedOut }); });
    });
}

const TORTURE = 'test/torture.mjs';

// One injected Kinds.test.mjs shard, parsed: LANE rows by id, node:test verdicts by name
// (the spec reporter, as Lanes.mjs runs it, passes the LANE / CALIB lines through raw).
async function shard(id, flags) {
    const r = await run(['--expose-gc', ...flags, '--test', '--test-reporter=spec', KINDS_TEST],
        { LOGN_SHARD: id, LOGN_INJECT: INJECT });
    const lanes = {};
    const tap = {};
    let calib = null, calibEnd = null, inject = null;
    for (const line of r.out.split('\n')) {
        if (line.startsWith('LANE\t')) {
            const p = line.split('\t');
            lanes[p[2]] = { kind: p[3], k: p[4], scav: +p[5], budget: +p[6], verdict: p[7] };
        } else if (line.startsWith('CALIB\t')) calib = line;
        else if (line.startsWith('CALIBEND\t')) calibEnd = line;
        else if (line.startsWith('INJECT\t')) inject = line;
        // spec reporter: "\u2714 name (1.2ms)" = pass, "\u2716 name (1.2ms)" = fail.
        const m = /^\s*(\u2714|\u2716) (.*) \([\d.]+ms\)\s*$/.exec(line);
        if (m && !(m[2] in tap)) tap[m[2]] = m[1] === '\u2714';
    }
    return { ...r, lanes, tap, calib, calibEnd, inject };
}
function tapOf(res, prefix) {
    for (const name of Object.keys(res.tap)) if (name.indexOf(prefix) === 0) return res.tap[name];
    return undefined;
}
function num(line, key) {
    const m = new RegExp(key + '=(\\d+)').exec(line || '');
    return m ? +m[1] : NaN;
}
function lanes(mode, extraEnv) {
    return run([LANES_JS], { LOGN_LANES_SELFTEST: 'fenwick:' + FAKE, LOGN_FAKE_MODE: mode, ...extraEnv });
}

// ---- spawn everything in parallel -------------------------------------------
const [
    sMain, sStale, sDrift, sDefer, sNiOk, sNiNoFlag, sNoMin, sNoMax, sNoNcr, sNiOverride,
    lOk, lNoCalib, lNoEnd, lZero, lShort, lLong, lExit1, lLeak,
    tUnderscore, tMarkerGuard,
] = await Promise.all([
    shard('inj', PIN),
    shard('inj-stale', PIN),
    shard('inj-drift', PIN),
    shard('inj-defer', PIN),
    shard('ni-inj', [...PIN, NOINL]),
    shard('ni-inj', PIN),
    shard('inj-tiny', [MAXS, NCR]),
    shard('inj-tiny', [MINS, NCR]),
    shard('inj-tiny', [MAXS, MINS]),
    shard('ni-inj', [...PIN, NOINL, '--max-inlined-bytecode-size=460']),
    lanes('ok'),
    lanes('nocalib'),
    lanes('nocalibend'),
    lanes('zero'),
    lanes('short'),
    lanes('long'),
    lanes('exit1'),
    lanes('ok', { LOGN_INJECT: INJECT }),
    // torture re-exec: an UNDERSCORE-spelled semi-space flag must be stripped, so the
    // child is pinned and the re-exec resolves once (no loop). The `--bootstrap-only` argv
    // token (forwarded through the re-exec) exits right after the bootstrap with the
    // sentinel 3 (never 0). A 30 s timeout guards against a regression loop.
    run(['--expose-gc', '--max_semi_space_size=8', TORTURE, '--bootstrap-only'], {}, 30000),
    // torture recursion guard: a child that is STILL unpinned with the marker set must
    // fail closed (exit 1), never re-exec again.
    run(['--expose-gc', TORTURE], { LOGN_TORTURE_REEXEC: '1' }, 30000),
]);

// The bootstrap probe is gated on the argv TOKEN, not an env var, and it MUST NOT be able
// to fake a green gate. Prove it directly: a real pinned run with the OLD env var set (and
// no --bootstrap-only) must ignore the env, run the full gate (G9 line present), and exit 1
// on 1.3.0 -- never exit 0 in under a second. Run sequentially (not in the parallel batch)
// so its CPU load cannot perturb the timing-sensitive injected shards above.
const tEnvIgnored = await run(['--expose-gc', MINS, MAXS, TORTURE],
    { LOGN_TORTURE_BOOTSTRAP_ONLY: '1' }, 420000);

// ---- hook hygiene -----------------------------------------------------------
test('hook: this process is NOT injected (LOGN_INJECT default off)', () => {
    assert.equal(INJECTED, '');
    assert.equal(LANES.some((l) => l.id.indexOf('Inj.') === 0), false);
    assert.equal(SHARDS.inj, undefined);
});
test('hook: an injected shard announces itself and calibrates normally', () => {
    assert.ok(sMain.inject && sMain.inject.indexOf(INJECT) !== -1, 'no INJECT line:\n' + sMain.out);
    assert.ok(/flags=ok/.test(sMain.calib || ''), 'calib: ' + sMain.calib);
    const B1 = num(sMain.calib, 'B1');
    assert.ok(B1 >= 8, 'B1=' + B1);
    assert.equal(tapOf(sMain, 'flags:'), true);
    assert.equal(tapOf(sMain, 'teeth calibration'), true);
    assert.equal(tapOf(sMain, 'scale did not drift'), true);
    assert.equal(tapOf(sMain, 'no stale BOUNDARY'), true);
});
test('hook: Lanes.mjs strips LOGN_INJECT from every child env', () => {
    // FakeShard drops CALIB if it sees LOGN_INJECT, so a leak reads as a malformed shard.
    assert.equal(lLeak.code, 0, lLeak.out + lLeak.err);
    assert.doesNotMatch(lLeak.out, /MALFORMED/);
});

// ---- (a) (b) (c): the budget matrix -----------------------------------------
function expectLane(res, id, verdict, k) {
    const l = res.lanes[id];
    assert.ok(l, id + ' emitted no LANE line:\n' + res.out);
    assert.equal(l.verdict, verdict, id + ' read ' + l.scav + ' vs budget ' + l.budget + ' (' + l.k + ')');
    assert.equal(l.k, 'k' + k, id + ' effective k');
    assert.equal(tapOf(res, id + ' ['), verdict === 'PASS', id + ' node:test verdict');
    return l;
}
test('control: a 0-box lane is GREEN at ZERO (k0, budget 2)', () => {
    const l = expectLane(sMain, 'Inj.clean', 'PASS', 0);
    assert.equal(l.budget, 2);
    assert.ok(l.scav <= 1, 'clean lane read ' + l.scav);
});
test('(a) one box / op, normal shard, not in BOUNDARY -> RED at ZERO', () => {
    const l = expectLane(sMain, 'Inj.oneBox', 'FAIL', 0);
    assert.equal(l.budget, 2);
});
test('(b) one box every other op -> RED at ZERO = 2', () => {
    const l = expectLane(sMain, 'Inj.halfBox', 'FAIL', 0);
    assert.equal(l.budget, 2);
});
test('(b+) one box every third op -> RED at ZERO = 2', () => {
    const l = expectLane(sMain, 'Inj.thirdBox', 'FAIL', 0);
    assert.equal(l.budget, 2);
});
test('(c) BOUNDARY k=1: exactly 1 box GREEN, 2 boxes RED (budget floor(1.5*Bcalib))', () => {
    const Bc = Math.min(num(sMain.calib, 'B1'), num(sMain.calibEnd, 'B1late'));  // conservative scale
    const a = expectLane(sMain, 'Inj.k1exact', 'PASS', 1);
    const b = expectLane(sMain, 'Inj.k1over', 'FAIL', 1);
    assert.equal(a.budget, Math.floor(1.5 * Bc));
    assert.equal(b.budget, Math.floor(1.5 * Bc));
});
test('(c) BOUNDARY k=2: exactly 2 boxes GREEN, 3 boxes RED (budget floor(2.5*Bcalib))', () => {
    const Bc = Math.min(num(sMain.calib, 'B1'), num(sMain.calibEnd, 'B1late'));
    const a = expectLane(sMain, 'Inj.k2exact', 'PASS', 2);
    const b = expectLane(sMain, 'Inj.k2over', 'FAIL', 2);
    assert.equal(a.budget, Math.floor(2.5 * Bc));
    assert.equal(b.budget, Math.floor(2.5 * Bc));
});
test('(a-c) the injected RED lanes turn the shard exit nonzero', () => {
    assert.notEqual(sMain.code, 0);
});

// ---- (d) stale BOUNDARY -----------------------------------------------------
test('(d) a k>=1 BOUNDARY lane that reads 0 fails the stale check', () => {
    const l = sStale.lanes['Inj.staleK1'];
    assert.ok(l, sStale.out);
    assert.equal(l.verdict, 'PASS', 'the lane itself is within budget');
    assert.ok(l.scav <= 2, 'stale lane read ' + l.scav);
    assert.equal(tapOf(sStale, 'no stale BOUNDARY'), false, 'stale check did not fire');
    assert.notEqual(sStale.code, 0);
});

// ---- (i)(j)(k) DEFERRED semantics (ROADMAP 8.4) -----------------------------
test('(i) a RED lane that is DEFERRED passes the gate (verdict DEFER)', () => {
    const l = sDefer.lanes['Inj.deferRed'];
    assert.ok(l, sDefer.out);
    assert.ok(l.scav > l.budget, 'deferRed should read RED, got ' + l.scav + '/' + l.budget);
    assert.equal(l.verdict, 'DEFER', 'a RED deferred lane is DEFER');
    assert.equal(tapOf(sDefer, 'Inj.deferRed ['), true, 'a DEFER lane PASSES node:test');
});
test('(j) a DEFERRED lane that is GREEN fails the gate (verdict UNDEFER, remove it)', () => {
    const l = sDefer.lanes['Inj.deferGreen'];
    assert.ok(l, sDefer.out);
    assert.ok(l.scav <= l.budget, 'deferGreen should read GREEN, got ' + l.scav + '/' + l.budget);
    assert.equal(l.verdict, 'UNDEFER', 'a GREEN deferred lane is UNDEFER');
    assert.equal(tapOf(sDefer, 'Inj.deferGreen ['), false, 'an UNDEFER lane FAILS node:test');
    assert.equal(tapOf(sDefer, 'no stale DEFERRED'), false, 'the stale-DEFERRED check fired');
});
test('(k) a RED lane that is NOT deferred fails the gate (verdict FAIL)', () => {
    const l = sDefer.lanes['Inj.undeferRed'];
    assert.ok(l, sDefer.out);
    assert.ok(l.scav > l.budget, 'undeferRed should read RED, got ' + l.scav + '/' + l.budget);
    assert.equal(l.verdict, 'FAIL', 'a RED non-deferred lane is FAIL');
    assert.equal(tapOf(sDefer, 'Inj.undeferRed ['), false, 'a FAIL lane FAILS node:test');
});
test('(i-k) the DEFERRED shard exits nonzero (the GREEN-deferred + RED-undeferred lanes)', () => {
    assert.notEqual(sDefer.code, 0);
});

// ---- (e) Lanes.mjs integrity checks (fake shard) ----------------------------
test('(e) control: a well-formed fake shard passes Lanes.mjs', () => {
    assert.equal(lOk.code, 0, lOk.out + lOk.err);
    assert.doesNotMatch(lOk.out, /MALFORMED/);
    assert.match(lOk.err, /SELFTEST HOOK ACTIVE/);
});
test('(e) missing CALIB -> Lanes fails', () => {
    assert.equal(lNoCalib.code, 1);
    assert.match(lNoCalib.out, /fenwick: missing CALIB header/);
});
test('(e) missing CALIBEND -> Lanes fails', () => {
    assert.equal(lNoEnd.code, 1);
    assert.match(lNoEnd.out, /fenwick: missing CALIBEND/);
});
test('(e) 0 LANE lines -> Lanes fails', () => {
    assert.equal(lZero.code, 1);
    assert.match(lZero.out, /fenwick: emitted 0 LANE lines/);
});
test('(e) N-1 LANE lines -> Lanes fails', () => {
    const exp = expectedCells('fenwick');
    assert.equal(lShort.code, 1);
    assert.match(lShort.out, new RegExp('fenwick: emitted ' + (exp - 1) + ' cells, expected ' + exp));
});
test('(e) N+1 LANE lines -> Lanes fails', () => {
    const exp = expectedCells('fenwick');
    assert.equal(lLong.code, 1);
    assert.match(lLong.out, new RegExp('fenwick: emitted ' + (exp + 1) + ' cells, expected ' + exp));
});
test('(e) a well-formed shard whose child exits nonzero -> Lanes fails', () => {
    assert.equal(lExit1.code, 1);
    assert.doesNotMatch(lExit1.out, /MALFORMED/);
});

// ---- (f) (g) flag audits ------------------------------------------------------
test('(f) control: ni- shard WITH --max-inlined-bytecode-size=0 passes its flag assert', () => {
    assert.equal(tapOf(sNiOk, 'flags:'), true, sNiOk.out);
    assert.ok(/noinline=true/.test(sNiOk.calib || ''));
    const l = sNiOk.lanes['Inj.niK1'];
    assert.ok(l && l.k === 'k1' && l.verdict === 'PASS', JSON.stringify(l));
});
test('(f) ni- shard WITHOUT --max-inlined-bytecode-size=0 fails its flag assert', () => {
    assert.equal(tapOf(sNiNoFlag, 'flags:'), false);
    assert.ok(/flags=MISSING/.test(sNiNoFlag.calib || ''));
    assert.notEqual(sNiNoFlag.code, 0);
});
test('(g) shard without --min-semi-space-size=4 fails its flag assert', () => {
    assert.equal(tapOf(sNoMin, 'flags:'), false);
    assert.notEqual(sNoMin.code, 0);
});
test('(g) shard without --max-semi-space-size=4 fails its flag assert', () => {
    assert.equal(tapOf(sNoMax, 'flags:'), false);
    assert.notEqual(sNoMax.code, 0);
});
test('(g) shard without --no-concurrent-recompilation fails its flag assert', () => {
    assert.equal(tapOf(sNoNcr, 'flags:'), false);
    assert.notEqual(sNoNcr.code, 0);
});
// Adversarial: V8 takes the LAST occurrence of a flag. A later
// --max-inlined-bytecode-size=460 silently re-enables inlining while the textual
// execArgv regex still finds "=0". The audit must check the EFFECTIVE value.
test('(f+) ni- shard whose =0 is overridden by a later --max-inlined-bytecode-size fails its flag assert', () => {
    assert.equal(tapOf(sNiOverride, 'flags:'), false,
        'flag audit accepted an overridden --max-inlined-bytecode-size (execArgv regex matches the first occurrence)');
});

// ---- (h) drift ----------------------------------------------------------------
// The drift injector is a TIMER (an unref'd background allocator), so under a busy machine it
// can fail to fire inside the late calibration window. The PROPERTY under test is "a shard whose
// scale drifts beyond DRIFT_GUARD fails". Retry the injected shard ALONE (up to 3 more times)
// until the injector actually drifts. Every attempt that drifted must have failed; at least one
// attempt must have drifted.
test('(h) a background allocator drifting B1 > DRIFT_GUARD fails the drift assert', async () => {
    const drifted = (r) => {
        const B1 = num(r.calib, 'B1'), late = num(r.calibEnd, 'B1late');
        return B1 >= 8 && Math.abs(late - B1) > DRIFT_GUARD * B1;
    };
    const attempts = [sDrift];
    while (!drifted(attempts[attempts.length - 1]) && attempts.length < 4) {
        attempts.push(await shard('inj-drift', PIN));
    }
    for (const r of attempts) {
        assert.ok(num(r.calib, 'B1') >= 8, 'B1=' + num(r.calib, 'B1'));
        if (drifted(r)) {
            assert.equal(tapOf(r, 'scale did not drift'), false, 'a drifted shard passed its drift assert');
            assert.notEqual(r.code, 0, 'a drifted shard exited 0');
        }
    }
    const last = attempts[attempts.length - 1];
    assert.ok(drifted(last), 'injection never drifted in ' + attempts.length + ' attempts: ' +
        attempts.map((r) => num(r.calib, 'B1') + '->' + num(r.calibEnd, 'B1late')).join(', '));
});

// ---- static: the S7k budget math ------------------------------------------------
test('S7k: ZERO = 2 at k=0; floor((k+0.5)*B1) for k>=1', () => {
    for (const B1 of [8, 11, 12, 13, 15, 24]) {
        assert.equal(budgetK(0, B1), 2);
        for (let k = 1; k <= 4; k++) assert.equal(budgetK(k, B1), Math.floor((k + 0.5) * B1));
    }
});
test('S7k: at a stable scale, k boxes pass and k+1 boxes fail, every k, every B1 >= 8', () => {
    for (let B1 = 8; B1 <= 64; B1++) {
        assert.ok(B1 > budgetK(0, B1), 'one box passes ZERO at B1=' + B1);
        for (let k = 1; k <= 4; k++) {
            assert.ok(k * B1 <= budgetK(k, B1), 'k=' + k + ' B1=' + B1);
            assert.ok((k + 1) * B1 > budgetK(k, B1), 'k+1 passes: k=' + k + ' B1=' + B1);
        }
    }
});
// The drift guard is DERIVED from the registry's max k (Kinds.mjs), and admits a scale
// in [1-DRIFT_GUARD, 1+DRIFT_GUARD] x B1. Box k+1 must still fail the k budget at the
// WORST admitted (smallest) scale, for every k the registry actually declares. Since
// budgetK(k,B1) ~ (k+0.5)*B1 and a box reads ~B1, the scale-free condition is
// (k+1)*(1-g) > (k+0.5). A future k=3 lane raises kMax, tightens DRIFT_GUARD, and this
// re-derives -- or the guard is too loose and the next test fails.
test('S7k: box k+1 fails at the worst scale the drift guard admits, for the max registered k', () => {
    const kMax = registryKMax();
    const worst = 1 - DRIFT_GUARD;
    for (let k = 1; k <= kMax; k++) {
        assert.ok((k + 1) * worst > (k + 0.5),
            'k=' + k + ': ' + (k + 1) + ' boxes at a ' + worst.toFixed(2) + 'x scale do not exceed the k+0.5 budget ratio');
    }
});
test('S7k: DRIFT_GUARD is derived from kMax and tight enough (g < 0.5/(kMax+1))', () => {
    const kMax = registryKMax();
    assert.equal(DRIFT_GUARD, driftGuardFor(kMax), 'guard not derived from registry kMax');
    assert.ok(DRIFT_GUARD < 0.5 / (kMax + 1), 'guard ' + DRIFT_GUARD + ' too loose for kMax=' + kMax);
    assert.equal(DRIFT_GUARD, 0.15, 'expected 0.15 at the current kMax=2');
});
test('BOUNDARY: no dead entry (k=0 for every kind in both shards)', () => {
    const dead = staleZeroBoundary();
    assert.equal(dead.length, 0, 'BOUNDARY entries that never box (remove them): ' + dead.join(', '));
});
test('budgetFor: a non-BOUNDARY lane in a normal shard is gated at ZERO for every kind', () => {
    for (const l of LANES) {
        if (BOUNDARY.has(l.id)) continue;
        for (const kind of ['int', 'frac', 'p31', 'n31', 'p53', 'p30']) assert.equal(budgetFor(l, kind, false, 12), 2, l.id + ' ' + kind);
    }
});
test('BOUNDARY: every entry names a registered lane', () => {
    const ids = new Set(LANES.map((l) => l.id));
    for (const id of BOUNDARY) assert.ok(ids.has(id), 'BOUNDARY entry ' + id + ' has no lane');
});
test('shard registry: kinds = 675 cells, noinline = 564 cells, every shard > 0', () => {
    // 1.4.0 added 5 new-API lanes (setFrom x2, search, quantileInto, rebuildFrom): +36 kinds cells    // (5 kinds x each group shard + 1 p30 each) and +25 noinline cells, over the 1.3.0 639 / 534 (setFrom x2, search, searchFrom, quantileInto, rebuildFrom).
    let a = 0, b = 0;
    for (const s of SHARDS_KINDS) { const n = expectedCells(s); assert.ok(n > 0, s); a += n; }
    for (const s of SHARDS_NOINLINE) { const n = expectedCells(s); assert.ok(n > 0, s); b += n; }
    assert.equal(a, 675);
    assert.equal(b, 564);
    for (const s of SHARDS_NOINLINE) assert.ok(SHARDS[s].flags.indexOf(NOINL) !== -1, s);
    for (const s of SHARDS_KINDS.concat(SHARDS_NOINLINE)) {
        for (const f of PIN) assert.ok(SHARDS[s].flags.indexOf(f) !== -1, s + ' ' + f);
    }
});

// ---- static: the G-EXIT record agrees with the registry ---------------------------
function gexitRows(section) {
    const md = fs.readFileSync(path.join(HERE, 'G-EXIT-1.3.0.md'), 'utf8').split('\n');
    const rows = [];
    let on = false;
    for (const line of md) {
        if (line.indexOf('## ') === 0) { on = line.indexOf('## ' + section + ' run') === 0; continue; }
        if (!on || line.indexOf('| ') !== 0 || line.indexOf('| lane') === 0 || line.indexOf('| ---') === 0) continue;
        const p = line.split('|').map((s) => s.trim());
        rows.push({ id: p[1], kind: p[2], shard: p[3], k: p[4], scav: +p[5], budget: +p[6], verdict: p[7] });
    }
    return rows;
}
for (const [section, total, red] of [['kinds', 639, 114], ['noinline', 534, 133]]) {
    test('G-EXIT ' + section + ': ' + total + ' rows, ' + red + ' red, every k / budget / verdict re-derives from the registry', () => {
        const rows = gexitRows(section);
        assert.equal(rows.length, total);
        assert.equal(rows.filter((r) => r.verdict === 'FAIL').length, red);
        const byId = new Map(LANES.map((l) => [l.id, l]));
        for (const r of rows) {
            const lane = byId.get(r.id);
            assert.ok(lane, 'G-EXIT row for unknown lane ' + r.id);
            const ni = r.shard.indexOf('ni-') === 0;
            const k = (!ni && !BOUNDARY.has(r.id)) ? 0 : laneK(lane, r.kind, ni);
            assert.equal(r.k, 'k' + k, r.id + ' [' + r.kind + '] ' + r.shard + ' k');
            assert.equal(r.budget, budgetFor(lane, r.kind, ni, 12), r.id + ' [' + r.kind + '] ' + r.shard + ' budget');
            assert.equal(r.verdict, r.scav <= r.budget ? 'PASS' : 'FAIL', r.id + ' [' + r.kind + '] verdict');
        }
    });
}

// ---- torture re-exec pinning (stage-G QA item 3 blocker) --------------------------
test('torture: an underscore-spelled semi-space flag is stripped; the re-exec resolves once, pinned (sentinel 3)', () => {
    assert.equal(tUnderscore.timedOut, false, 'torture re-exec LOOPED (timeout) on --max_semi_space_size=8:\n' + tUnderscore.err);
    assert.equal(tUnderscore.code, 3, 'expected the bootstrap sentinel 3, got ' + tUnderscore.code + '\n' + tUnderscore.out + tUnderscore.err);
    assert.match(tUnderscore.out, /BOOTSTRAP pinned=true/, 'child not pinned:\n' + tUnderscore.out + tUnderscore.err);
});
test('torture: --bootstrap-only fails CLOSED -- it never exits 0 (no fake green)', () => {
    assert.notEqual(tUnderscore.code, 0, 'the bootstrap probe must not exit 0');
});
test('torture: a still-unpinned child with the recursion marker set fails closed (exit 1, no loop)', () => {
    assert.equal(tMarkerGuard.timedOut, false, 'marker guard LOOPED (timeout):\n' + tMarkerGuard.err);
    assert.equal(tMarkerGuard.code, 1, 'expected exit 1, got ' + tMarkerGuard.code);
    assert.match(tMarkerGuard.err, /\[lite-logn\] torture: FAIL -- new-space still unpinned/);
});
test('torture: LOGN_TORTURE_BOOTSTRAP_ONLY env is IGNORED -- a real run still measures (G9 present)', () => {
    assert.equal(tEnvIgnored.timedOut, false, 'torture did not finish in time:\n' + tEnvIgnored.err);
    assert.doesNotMatch(tEnvIgnored.out, /BOOTSTRAP pinned/, 'the env var must NOT trigger the bootstrap probe (fail-open)');
    assert.match(tEnvIgnored.out, /G9 scavenge gate/, 'the full gate did not run:\n' + tEnvIgnored.out.slice(-400));
    // Post-1.4.0: F3 / F4 closed the LCT / 2D / PST G9 lanes and the only RED (Treap.successor) is
    // DEFERRED, so a real run now exits 0. The env var still must not fake a bootstrap probe (checked
    // above); the teeth that prove the gate CAN fail live in the G9 self-calibration + the (a)-(k)
    // injected cases, not in this member's exit code.
    assert.equal(tEnvIgnored.code, 0, 'a real run now exits 0 (fixes landed, remaining RED deferred); got ' + tEnvIgnored.code);
});

// ---- RedDiff MISSING (stage-G QA item 4) ------------------------------------------
test('RedDiff: a G-EXIT cell absent from the run is MISSING, not RED->GREEN', () => {
    // exp: one red (A), one green (B), one red (C). got: A now green (a real fix), B still
    // green, and C DROPPED entirely (a short run) plus B dropped too -> B green-missing.
    const row = (lane, verdict) => '| ' + lane + ' | frac | seg | doubleIO | 9 | 2 | ' + verdict + ' |';
    const exp = [row('A', 'FAIL'), row('B', 'PASS'), row('C', 'FAIL')];
    const got = [row('A', 'PASS')];                 // B and C not emitted
    const d = computeDiff(exp, got);
    assert.deepEqual(d.nowGreen, ['A|frac|seg'], 'A is the only real RED->GREEN');
    assert.deepEqual(d.redMissing, ['C|frac|seg'], 'C (was RED, dropped) must be RED->MISSING');
    assert.deepEqual(d.greenMissing, ['B|frac|seg'], 'B (was GREEN, dropped) must be GREEN->MISSING');
    assert.equal(d.nowGreen.includes('C|frac|seg'), false, 'a dropped RED lane must NOT count as a fix');
});
