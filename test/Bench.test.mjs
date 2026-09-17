/**
 * @zakkster/lite-logn -- benchmark suite GATE (node:test).
 *
 * Repo-only. The real gate for the eight-dimension Bench v2 suite ADOPTED from
 * lite-o1 (a COPY-AND-WIRE session). It proves:
 *
 *   1. ANTI-VACUITY. Every dimension (D1..D8), for every member, returns positive,
 *      non-degenerate numbers where a measurement applies; every INAPPLICABLE cell
 *      is the STRING "n/a", NEVER a numeric 0. vacuityCheck throws on an empty array
 *      or an impossible 0 -> this test fails -> non-zero exit. (Allocation-per-op +
 *      GC-pause are ALLOWED 0 -- for a zero-GC library 0 is correct, so they are
 *      excluded from _check.)
 *
 *   2. FIXED-SEED DETERMINISM. Two runs of the workload trace at the gate seed
 *      0x9e3779b1 produce BYTE-IDENTICAL trace hashes -- a pure function of the seed
 *      (the repo's Numerical Recipes LCG).
 *
 *   3. STRUCTURE. D1 emits exactly the 7 gated witness op-rows; the FOILS registry
 *      carries those 7 + the SkipList counter-foil; the matrix is 4 x 8 = 32 cells.
 *
 * Runs in-process at SMALL sizes; D1 skips the O(n^2) foil here (opts.foil=false) and
 * defers the "foil leaves the line" proof to `npm run bench` + the witness gate. The
 * orchestrator Bench.mjs runs the full sizes in clean child processes.
 */

import test from 'node:test';
import assert from 'node:assert/strict';

import {
    D1, D2, D3, D4, D5, D6, D7, D8, traceHash, vacuityCheck,
    memberBytes, theoreticalMinPerLive, makeSubject, makeOpKernel, churnNs, FOILS, foilRowKeys,
} from '../benchmark/Dimensions.mjs';
import {
    SUBJECTS, OP_ROWS, DIMENSIONS, NA, RATIONALE, counterFoilFor, cells,
} from '../benchmark/Matrix.mjs';
import {
    stats, bootstrapCI, mannWhitney, subtractOverhead, calibrateOverheadNs, median,
    BOOTSTRAP_RESAMPLES, CI_LEVEL, MW_Z_THRESHOLD,
} from '../benchmark/Harness.mjs';
import { createBenchKit, validateManifest } from '../benchmark/Template.mjs';
import { driftFraction, driftExceeds, DRIFT_LIMIT, sentinelMetric } from '../benchmark/Bench.mjs';

const SEED = 0x9e3779b1 >>> 0;

// Small per-dimension opts so the gate runs fast in-process; the orchestrator runs
// the full sizes in clean child processes. D1: 2-point fit, foil skipped (see above).
const OPTS = {
    D1: { seed: SEED, points: 2, foil: false },
    D2: { seed: SEED, n: 1024, total: 1 << 14 },
    D3: { seed: SEED, n: 2048 },
    D4: { seed: SEED, sizes: [1e3, 1e4], reps: 30, gapN: 4096 },
    D5: { seed: SEED },
    D6: { seed: SEED, sizes: [1e3, 1e4], ops: 3e4 },
    D7: { seed: SEED, n: 2048, loadFactors: [0.3, 0.5, 0.7, 0.9], orderN: 1024 },
    D8: { seed: SEED, n: 2048 },
};

const SYNC = { D1, D2, D3, D4, D7, D8 };
const ASYNC = { D5, D6 };

/** Op-row count per member (the gated D1 witness rows). */
const OPS_PER_MEMBER = { BinaryHeap: 1, Fenwick: 2, SegmentTree: 2, SkipList: 2 };

for (const member of SUBJECTS) {
    test('anti-vacuity: ' + member + ' D1/D2/D3/D4/D7/D8 return positive numbers', () => {
        for (const [dim, fn] of Object.entries(SYNC)) {
            const r = fn(member, OPTS[dim]);
            assert.equal(r.dim, dim);
            assert.equal(r.member, member);
            assert.ok(vacuityCheck(r), dim + '/' + member + ' vacuity');
        }
    });

    test('anti-vacuity: ' + member + ' D5/D6 (async) return positive numbers', async () => {
        for (const [dim, fn] of Object.entries(ASYNC)) {
            const r = await fn(member, OPTS[dim]);
            assert.equal(r.dim, dim);
            assert.ok(vacuityCheck(r), dim + '/' + member + ' vacuity');
        }
    });

    test('D1: ' + member + ' emits its gated witness op-rows (numeric r2/slope, on-line boolean)', () => {
        const r = D1(member, OPTS.D1);
        assert.equal(r.ops.length, OPS_PER_MEMBER[member], member + ' op-row count');
        for (const o of r.ops) {
            assert.equal(typeof o.r2, 'number', member + '.' + o.op + ' r2 numeric');
            assert.ok(o.r2 > 0 && o.r2 <= 1.0000001, member + '.' + o.op + ' r2 in (0,1]');
            assert.equal(typeof o.slope, 'number', member + '.' + o.op + ' slope numeric');
            assert.equal(typeof o.onLine, 'boolean', member + '.' + o.op + ' onLine boolean');
        }
    });

    test('D1: ' + member + ' counter-foil + max single insert are the string n/a unless SkipList (never 0)', () => {
        const r = D1(member, OPTS.D1);
        if (member === 'SkipList') {
            assert.equal(typeof r.counterFoil, 'object', 'SkipList counter-foil must be an object');
            assert.equal(typeof r.counterFoil.getNsPerOp, 'number');
            assert.deepEqual(r.counterFoil.cannotAnswer, ['successor', 'predecessor', 'rangeIter']);
            assert.equal(typeof r.maxSingleOp, 'number', 'SkipList max single insert must be numeric');
            assert.ok(r.maxSingleOp > 0, 'max single insert must be positive');
        } else {
            assert.equal(r.counterFoil, NA, member + ' counter-foil must be the NA string');
            assert.notEqual(r.counterFoil, 0, member + ' counter-foil must never be the number 0');
            assert.equal(r.maxSingleOp, NA, member + ' max single insert must be the NA string');
        }
    });

    test('D5 tree-shaking: ' + member + ' single import drops the other members', async () => {
        const r = await D5(member, OPTS.D5);
        assert.ok(r.ratio < 0.5,
            member + ' single/all ratio ' + r.ratio.toFixed(3) + ' must be < 0.50 ' +
            '(single ' + r.single.gzip + 'B vs all ' + r.all.gzip + 'B)');
    });

    test('D7: ' + member + ' string/object keys are the NA string; insertion order NA unless order-sensitive', () => {
        const r = D7(member, OPTS.D7);
        assert.equal(typeof r.keyTypes.int, 'number', member + ' int key must be numeric');
        assert.equal(r.keyTypes.string, NA, member + ' string key must be the NA string');
        assert.equal(r.keyTypes.object, NA, member + ' object key must be the NA string');
        assert.notEqual(r.keyTypes.string, 0, member + ' string key must never be 0');
        if (member === 'BinaryHeap' || member === 'SkipList') {
            assert.equal(typeof r.insertionOrder, 'object', member + ' insertion order must be measured');
            assert.ok(r.insertionOrder.adversarial > 0, member + ' adversarial order must be positive');
        } else {
            assert.equal(r.insertionOrder, NA, member + ' (index-addressed) insertion order must be NA');
            assert.notEqual(r.insertionOrder, 0, member + ' insertion order must never be 0');
        }
    });

    test('D8: ' + member + ' ordered workload is the NA string unless SkipList (never 0)', () => {
        const r = D8(member, OPTS.D8);
        assert.ok(r.churn.nsPerOp > 0, member + ' churn must be positive');
        if (member === 'SkipList') {
            assert.equal(typeof r.ordered, 'object', 'SkipList ordered workload must be measured');
            assert.ok(r.ordered.successorNsPerOp > 0 && r.ordered.rangeScanNsPerKey > 0);
        } else {
            assert.equal(r.ordered, NA, member + ' ordered workload must be the NA string');
            assert.notEqual(r.ordered, 0, member + ' ordered workload must never be 0');
        }
    });

    test('D6: ' + member + ' carries a per-op-row alloc curve (zeroAlloc + throughput points)', async () => {
        const r = await D6(member, OPTS.D6);
        assert.equal(r.perOp.length, OPS_PER_MEMBER[member], member + ' D6 op-row count');
        for (const o of r.perOp) {
            assert.ok(o.points.length > 0, member + '.' + o.op + ' must carry sweep points');
            for (const p of o.points) {
                assert.ok(p.opsPerMs > 0 && Number.isFinite(p.opsPerMs), member + '.' + o.op + ' throughput positive');
                assert.ok(p.bytesPerOp >= 0, member + '.' + o.op + ' bytes/op non-negative');
            }
        }
    });

    test('fixed-seed determinism: ' + member + ' trace hash is byte-identical across runs', () => {
        const a = traceHash(member, SEED, 20000);
        const b = traceHash(member, SEED, 20000);
        assert.equal(a, b, member + ' trace hash must be deterministic at seed 0x9e3779b1');
        assert.equal(typeof a, 'number');
        assert.ok(a >>> 0 === a, 'trace hash is a uint32');
        const c = traceHash(member, (SEED ^ 0x1) >>> 0, 20000);
        assert.notEqual(a, c, member + ' trace hash must depend on the seed');
    });
}

test('structure: D1 emits exactly the 7 gated witness op-rows across the 4 members', () => {
    let total = 0;
    const rowKeys = [];
    for (const m of SUBJECTS) {
        const r = D1(m, OPTS.D1);
        total += r.ops.length;
        for (const o of r.ops) rowKeys.push(m + '.' + o.op);
    }
    assert.equal(total, 7, 'D1 must emit exactly 7 gated op-rows');
    assert.deepEqual(rowKeys, OP_ROWS, 'the emitted op-rows must equal Matrix.OP_ROWS');
});

test('structure: the FOILS registry is the 7 gated rows + the SkipList counter-foil; cells() is 4 x 8 = 32', () => {
    assert.deepEqual(foilRowKeys(), OP_ROWS, 'FOILS gated rows must equal OP_ROWS');
    for (const k of OP_ROWS) assert.ok(FOILS[k] && typeof FOILS[k].run === 'function', k + ' must carry a kernel');
    assert.ok(FOILS['SkipList.counter'] && FOILS['SkipList.counter'].kind === 'counter-foil',
        'the SkipList counter-foil must be registered');
    assert.equal(Object.keys(FOILS).length, OP_ROWS.length + 1, 'FOILS = 7 gated rows + 1 counter-foil');
    assert.equal(cells().length, SUBJECTS.length * DIMENSIONS.length, 'matrix must be 4 x 8 = 32 cells');
    assert.equal(cells().length, 32);
});

test('D1 foil path (exercised once, cheaply): the O(n) foil LEAVES the log line', () => {
    // The full O(n^2) foil is skipped in the vacuity loop; run it once for the cheapest
    // member (BinaryHeap, one op-row, small sweep) to prove the foil path + off-line verdict.
    const r = D1('BinaryHeap', { seed: SEED, points: 2, foil: true });
    const o = r.ops[0];
    assert.equal(typeof o.foilR2, 'number', 'foil r2 must be numeric when the foil is computed');
    assert.equal(typeof o.foilOff, 'boolean', 'foilOff must be a boolean when the foil is computed');
    assert.ok(o.foilR2 >= 0 && o.foilR2 <= 1.0000001, 'foil r2 in [0,1]');
});

// QA (coverage gap closed): the test above only checked foilR2/foilOff are the RIGHT
// TYPES -- it never checked the foil actually DEPARTS the log line. A foil silently
// pointed at the real O(log n) op (or any accidentally-logarithmic substitute) would
// still pass it. This is the genuine, non-vacuous departure check, across every one
// of the 7 gated op-rows, not just BinaryHeap.pop. points MUST be >= 5: a fit through
// only 2 or 3 points is nearly-always R^2 ~ 1 regardless of the underlying shape (a
// line is trivially perfectly determined by too few points), which would make this
// assertion vacuously pass on ANY foil, defeating the whole point of the check.
test('D1 foil departure (all 7 gated op-rows): every foil genuinely MISSES the R^2 floor', () => {
    let checked = 0;
    for (const member of SUBJECTS) {
        const r = D1(member, { seed: SEED, points: 5, foil: true });
        for (const o of r.ops) {
            assert.ok(o.foilOff === true,
                member + '.' + o.op + ' foil must be OFF-LINE (foilR2=' + o.foilR2 + ' floor=' + o.r2Floor + ')');
            assert.ok(o.foilR2 < o.r2Floor,
                member + '.' + o.op + ' foil r2 ' + o.foilR2 + ' must miss the R^2 floor ' + o.r2Floor);
            checked++;
        }
    }
    assert.equal(checked, 7, 'must have checked all 7 gated op-rows for foil departure');
});

test('vacuityCheck has teeth: an impossible 0 in _check throws', () => {
    assert.throws(() => vacuityCheck({ dim: 'DX', member: 'X', _check: [1, 0, 2] }), /impossible value/);
    assert.throws(() => vacuityCheck({ dim: 'DX', member: 'X', _check: [] }), /no _check values/);
    assert.throws(() => vacuityCheck({ dim: 'DX', member: 'X', _check: [1], points: [] }), /empty array/);
    assert.throws(() => vacuityCheck({ dim: 'DX', member: 'X', _check: [1], ops: [] }), /empty array/);
    assert.throws(() => vacuityCheck({ dim: 'DX', member: 'X', _check: [-3] }), /impossible value/);
    assert.throws(() => vacuityCheck({ dim: 'DX', member: 'X', _check: [Infinity] }), /impossible value/);
});

test('fall-through THROWS: every per-member dispatch site rejects an unknown member', () => {
    assert.throws(() => memberBytes('Bogus', {}), /unhandled member: Bogus/);
    assert.throws(() => theoreticalMinPerLive('Bogus'), /unhandled member: Bogus/);
    assert.throws(() => makeSubject('Bogus', 16), /unhandled member: Bogus/);
    assert.throws(() => churnNs('Bogus', 16, SEED), /unhandled member: Bogus/);
    assert.throws(() => traceHash('Bogus', SEED, 8), /unhandled member: Bogus/);
    assert.throws(() => makeOpKernel('BinaryHeap', 'bogus', 16), /unhandled op-row/);
    assert.throws(() => D1('Bogus', OPTS.D1), /unhandled member: Bogus/);
    assert.throws(() => D2('Bogus', OPTS.D2), /unhandled member: Bogus/);
    assert.throws(() => D3('Bogus', OPTS.D3), /unhandled member: Bogus/);
    // Every real SUBJECT resolves in each dispatch site.
    for (const m of SUBJECTS) {
        assert.ok(theoreticalMinPerLive(m) > 0, m + ' theoMin positive');
        assert.equal(typeof makeSubject(m, 16).op, 'function', m + ' makeSubject');
        assert.equal(typeof traceHash(m, SEED, 8), 'number', m + ' traceHash');
    }
    for (const k of OP_ROWS) {
        const [mem, op] = k.split('.');
        assert.equal(typeof makeOpKernel(mem, op, 16).op, 'function', k + ' makeOpKernel');
    }
});

test('RATIONALE: all 4 members carry a FAIR-ALREADY verdict; only SkipList names a counter-foil', () => {
    for (const m of SUBJECTS) {
        const r = RATIONALE[m];
        assert.ok(r, m + ' must have a rationale');
        assert.equal(r.verdict, 'FAIR-ALREADY', m + ' verdict');
        assert.equal(typeof r.why, 'string');
        assert.ok(r.why.length > 0, m + ' rationale must be non-empty');
        if (m === 'SkipList') {
            assert.notEqual(r.counter, NA, 'SkipList must name its counter-foil');
            assert.notEqual(counterFoilFor(m), NA, 'counterFoilFor(SkipList) must name a foil');
        } else {
            assert.equal(r.counter, NA, m + ' must have counter = NA');
            assert.equal(counterFoilFor(m), NA, m + ' counterFoilFor must be the NA string');
        }
    }
});

test('drift sentinel: pure helpers compute the fraction + fire the warn predicate', () => {
    assert.ok(Math.abs(driftFraction(100, 130) - 0.30) < 1e-12, 'drift ' + driftFraction(100, 130));
    assert.equal(driftExceeds(100, 130), true);
    assert.ok(Math.abs(driftFraction(100, 105) - 0.05) < 1e-12);
    assert.equal(driftExceeds(100, 105), false);
    assert.equal(driftFraction(0, 130), 0);
    assert.equal(driftFraction(-5, 130), 0);
    assert.equal(driftFraction(100, Infinity), 0);
    assert.equal(DRIFT_LIMIT, 0.10);
    assert.equal(sentinelMetric({ points: [{ nsPerOp: 42 }] }), 42);
    assert.equal(sentinelMetric({}), 0, 'a shapeless result yields 0, not a throw');
});

// ===========================================================================
// Shared Harness statistics (the SAME rigorous core lite-o1 uses).
// ===========================================================================

test('bootstrapCI: deterministic given (samples, seed); band brackets the median; n<8 -> n/a', () => {
    const samples = Array.from({ length: 50 }, (_, i) => i + 1);
    const a = bootstrapCI(samples, SEED);
    const b = bootstrapCI(samples, SEED);
    assert.deepEqual(a, b, 'same seed must give identical lo/hi/rciw');
    assert.ok(a.lo <= a.hi, 'lo <= hi');
    const med = median(samples);
    assert.ok(a.lo <= med && med <= a.hi, 'band must bracket the median');
    assert.ok(Number.isFinite(a.rciw) && a.rciw >= 0, 'rciw ' + a.rciw);
    const c = bootstrapCI(samples, (SEED ^ 0x1234) >>> 0);
    assert.ok(c.lo !== a.lo || c.hi !== a.hi, 'a different seed should move the band');
    assert.equal(bootstrapCI([1, 2, 3], SEED), 'n/a');
    assert.equal(bootstrapCI([], SEED), 'n/a');
    assert.equal(BOOTSTRAP_RESAMPLES, 1000);
    assert.equal(CI_LEVEL, 0.95);
});

test('mannWhitney: identical -> not significant; separated -> significant; n<8 -> n/a', () => {
    const x = Array.from({ length: 20 }, (_, i) => (i * 7 + 3) % 13);
    const same = mannWhitney(x, x.slice());
    assert.equal(same.significant, false, 'identical samples must never be significant');
    assert.ok(Math.abs(same.z) < 1e-9, 'z on identical samples ~ 0');
    const a = Array.from({ length: 15 }, (_, i) => i + 1);
    const b = Array.from({ length: 15 }, (_, i) => i + 1001);
    const sep = mannWhitney(a, b);
    assert.equal(sep.significant, true, 'a fully-separated pair must be significant');
    assert.ok(Math.abs(sep.z) >= MW_Z_THRESHOLD, 'z clears the threshold');
    assert.equal(mannWhitney([1, 2, 3], b), 'n/a');
});

test('stats + subtractOverhead: fail closed, never negative, never spuriously stable', () => {
    assert.deepEqual(stats([]), { median: 0, mean: 0, cv: 0, stable: false });
    const flat = stats([10, 10, 10, 10]);
    assert.equal(flat.cv, 0);
    assert.equal(flat.stable, true);
    assert.equal(subtractOverhead(20, 5), 15);
    assert.equal(subtractOverhead(5, 10), 0, 'below-overhead reading clamps to 0');
    const ov = calibrateOverheadNs(2000);
    assert.ok(ov >= 0 && Number.isFinite(ov));
    assert.equal(calibrateOverheadNs(0), 0);
});

// ===========================================================================
// The package-agnostic Template (blueprint smoke test).
// ===========================================================================

test('Template: validateManifest fails closed; createBenchKit runs one dimension on a fake member+foil', () => {
    assert.throws(() => validateManifest({}), /members/);
    assert.throws(() => validateManifest({ members: ['A'] }), /subject/);
    assert.throws(() => validateManifest({ members: ['A'], subject() {} }), /primaryFoil/);

    const manifest = {
        name: 'fake-pkg',
        members: ['Fake'],
        subject: () => { let x = 0; return { obj: {}, op: () => { x = (x + 1) & 1023; if (x === 0) x = 1; } }; },
        primaryFoil: () => { let x = 0; return { op: () => { for (let j = 0; j < 5; j++) x += j; if (x > 1e9) x = 0; } }; },
        strongFoil: () => { let x = 0; return { op: () => { x = (x + 3) & 2047; } }; },
        witness: {
            flavor: 'O(log n)',
            build: () => ({ op: () => {} }),
            foil: () => ({ op: () => {} }),
            sizes: [1e3, 1e4], batch: 1e4, reps: 3,
        },
        dimensions: ['D1'],
    };
    const kit = createBenchKit(manifest);
    assert.deepEqual(kit.members, ['Fake']);
    assert.equal(kit.na, 'n/a');

    const r = kit.runLatency('Fake', { n: 256, batch: 500, samples: 40 });
    assert.equal(r.dim, 'D1');
    assert.equal(typeof r.subject.p50, 'number');
    assert.ok(vacuityCheck(r), 'template D1 result must be non-vacuous');

    const w = kit.runWitness();
    assert.equal(w.flavor, 'O(log n)');
    assert.ok(Number.isFinite(w.subject.flatness), 'witness subject flatness must be finite');

    assert.throws(() => kit.runLatency('Nope', {}), /unhandled member/);
    assert.throws(() => kit.rationale('Nope'), /unhandled member/);
});
