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

// Bench v3 re-adopt (reconcile from lite-o1's upgraded shared kit).
import { clearWitness } from '../benchmark/Dimensions.mjs';
import {
    OP_CLASS, OLOGN_WORST, OLOGN_EXPECTED, OLOGN_AMORTIZED, CLEAR_WITNESS, CLEAR_WITNESS_EXCLUDED,
    CLAIM_CLASS, classifyClaim,
} from '../benchmark/Matrix.mjs';
import {
    SPIKE_TAGS, assertTag, tagByte, attributeMax, bandOf, CACHE_BANDS, paretoFrontier, sparseTax,
} from '../benchmark/Template.mjs';
import { renderHtml } from '../benchmark/Report.mjs';
import {
    MEMBERS as WITNESS_MEMBERS, BINARYHEAP_R2_FLOOR, BINARYHEAP_SLOPE_LO, BINARYHEAP_SLOPE_HI,
} from './witness.mjs';
import { BinaryHeap, Fenwick, SegmentTree, SkipList, Treap, Scapegoat, MinMaxHeap, SplayTree } from '../LogN.js';
import { readFileSync } from 'node:fs';

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
const OPS_PER_MEMBER = { BinaryHeap: 1, Fenwick: 2, SegmentTree: 2, SkipList: 2, Treap: 1, Scapegoat: 1, MinMaxHeap: 1, SplayTree: 1 };

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
        if (member === 'BinaryHeap' || member === 'SkipList' || member === 'Treap' || member === 'Scapegoat' || member === 'MinMaxHeap' || member === 'SplayTree') {
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
        if (member === 'SkipList' || member === 'Treap' || member === 'Scapegoat' || member === 'SplayTree') {
            assert.equal(typeof r.ordered, 'object', member + ' ordered workload must be measured');
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

test('structure: D1 emits exactly the 11 gated witness op-rows across the 8 members', () => {
    let total = 0;
    const rowKeys = [];
    for (const m of SUBJECTS) {
        const r = D1(m, OPTS.D1);
        total += r.ops.length;
        for (const o of r.ops) rowKeys.push(m + '.' + o.op);
    }
    assert.equal(total, 11, 'D1 must emit exactly 11 gated op-rows');
    assert.deepEqual(rowKeys, OP_ROWS, 'the emitted op-rows must equal Matrix.OP_ROWS');
});

test('structure: the FOILS registry is the 11 gated rows + the SkipList counter-foil; cells() is 8 x 8 = 64', () => {
    assert.deepEqual(foilRowKeys(), OP_ROWS, 'FOILS gated rows must equal OP_ROWS');
    for (const k of OP_ROWS) assert.ok(FOILS[k] && typeof FOILS[k].run === 'function', k + ' must carry a kernel');
    assert.ok(FOILS['SkipList.counter'] && FOILS['SkipList.counter'].kind === 'counter-foil',
        'the SkipList counter-foil must be registered');
    assert.equal(Object.keys(FOILS).length, OP_ROWS.length + 1, 'FOILS = 11 gated rows + 1 counter-foil');
    assert.equal(cells().length, SUBJECTS.length * DIMENSIONS.length, 'matrix must be 8 x 8 = 64 cells');
    assert.equal(cells().length, 64);
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
test('D1 foil departure (all 11 gated op-rows): every foil genuinely MISSES the R^2 floor', () => {
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
    assert.equal(checked, 11, 'must have checked all 11 gated op-rows for foil departure');
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

test('RATIONALE: all 8 members carry a FAIR-ALREADY verdict; only SkipList names a counter-foil', () => {
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

// ===========================================================================
// Bench v3 re-adopt -- reconcile of lite-o1's upgraded shared kit to the O(log n)
// honesty contract. Each assertion must BITE (qa mutation-verifies).
// ===========================================================================

const REPORT_SRC = readFileSync(new URL('../benchmark/Report.mjs', import.meta.url), 'utf8');
const BENCH_SRC = readFileSync(new URL('../benchmark/Bench.mjs', import.meta.url), 'utf8');
const METHODOLOGY_SRC = readFileSync(new URL('../benchmark/METHODOLOGY.md', import.meta.url), 'utf8');
const PROVE_RE = /prove|proof|proven/i;

test('#1 witness gate UNCHANGED: R^2 floor 0.958, BinaryHeap band [5.76,13.44], MEMBERS.length 10', () => {
    // The frozen O(log n) witness gate (test/witness.mjs, D-02) is the family anchor; the
    // re-adopt must never loosen or re-center it. A mutation to any of these constants BITES.
    assert.equal(BINARYHEAP_R2_FLOOR, 0.958, 'the frozen R^2 floor');
    assert.equal(BINARYHEAP_SLOPE_LO, 5.76, 'the frozen BinaryHeap slope band low');
    assert.equal(BINARYHEAP_SLOPE_HI, 13.44, 'the frozen BinaryHeap slope band high');
    assert.equal(WITNESS_MEMBERS.length, 11, 'the 11 gated witness op-rows (10 prior + SplayTree.get)');
});

test('#1 witness IDENTITY: lite-logn is O(log n), never relabelled O(1)/throughput-invariant', () => {
    // lite-logn's OWN witness label surfaces (its report + orchestrator) must describe the
    // O(log n) straight-line witness -- NEVER the SIBLING lite-o1 family's O(1)-flatness /
    // throughput-invariance witness. Importing that wording into lite-logn is a dishonesty
    // (a different family's witness), so a mutation that relabels the witness here BITES on
    // the positive anchor OR the forbidden-phrase check. Scoped to the label surfaces (NOT
    // the package-agnostic Template flavor enum, which legitimately lists 'O(1)' for siblings,
    // and NOT METHODOLOGY which honestly CONTRASTS with lite-o1's O(1) witness).
    for (const [name, src] of [['Report.mjs', REPORT_SRC], ['Bench.mjs', BENCH_SRC]]) {
        assert.ok(/O\(log n\) Witness/i.test(src), name + ' must label the witness O(log n) (positive anchor)');
        assert.ok(!/O\(1\) Witness/i.test(src), name + ' must not relabel lite-logn\'s witness as an O(1) Witness');
        assert.ok(!/throughput[- ]invarian/i.test(src), name + ' must not import throughput-invariance wording');
    }
    // The Template smoke manifest declares the O(log n) flavor (not O(1)); a flip BITES.
    assert.ok(/flavor:\s*'O\(log n\)'/.test(readFileSync(new URL('./Bench.test.mjs', import.meta.url), 'utf8')),
        'the Template smoke manifest must declare the O(log n) witness flavor');
});

test('#2 OP_CLASS: covers the 11 witness rows; SkipList/Treap EXPECTED; Scapegoat get WORST + set/delete AMORTIZED; SplayTree get/set/delete AMORTIZED; MinMaxHeap WORST; no op painted O(1)', () => {
    // Every gated witness op-row carries an honest O(log n) class.
    for (const key of OP_ROWS) {
        assert.ok(key in OP_CLASS, key + ' (a gated witness row) must have an OP_CLASS entry');
        assert.ok(/O\(log n\)/.test(OP_CLASS[key]), key + ' must be labelled O(log n), got ' + OP_CLASS[key]);
    }
    // No op anywhere may be painted O(1) -- O(1) is the SIBLING lite-o1's contract, not lite-logn's.
    for (const [key, cls] of Object.entries(OP_CLASS)) {
        assert.ok(!/O\(1\)/.test(cls), key + ' must NOT be painted O(1) (that is a different family): ' + cls);
        assert.ok(cls === OLOGN_WORST || cls === OLOGN_EXPECTED || cls === OLOGN_AMORTIZED, key + ' unknown class ' + cls);
    }
    // SkipList's randomized towers + Treap's randomized priority heap -> EXPECTED, never
    // worst-case. Mislabelling any as worst-case BITES.
    for (const op of ['SkipList.get', 'SkipList.set', 'SkipList.delete', 'Treap.get', 'Treap.set', 'Treap.delete']) {
        assert.equal(OP_CLASS[op], OLOGN_EXPECTED, op + ' must be the EXPECTED class string');
        assert.ok(!/worst-case/.test(OP_CLASS[op]), op + ' must not be labelled worst-case (randomized)');
    }
    // The deterministic structures ARE worst-case O(log n) (full-height walk). Covers every
    // Table-A worst-case op INCLUDING BinaryHeap.push (not a gated D1 row, but still an
    // OP_CLASS entry) so a mutation flipping push to 'expected' BITES here. Scapegoat.get is
    // ALSO worst-case (a hard deterministic height bound, unlike the randomized members).
    for (const op of ['BinaryHeap.push', 'BinaryHeap.pop', 'Fenwick.update', 'Fenwick.prefix', 'SegmentTree.update', 'SegmentTree.query', 'Scapegoat.get', 'MinMaxHeap.push', 'MinMaxHeap.popMin', 'MinMaxHeap.popMax']) {
        assert.equal(OP_CLASS[op], OLOGN_WORST, op + ' must be the WORST-case O(log n) class string');
    }
    // Scapegoat's DETERMINISTIC set/delete pay for the worst-case get with an occasional rebuild
    // -> AMORTIZED, a THIRD honesty class distinct from both worst-case and (randomized) expected.
    // Mislabelling either as worst-case (hiding the rebuild spike) or expected (implying RNG) BITES.
    // SplayTree is DETERMINISTIC (no RNG) but SELF-ADJUSTING -- get/set/delete all SPLAY, so
    // the cost is AMORTIZED O(log n) (a cold deep splay is a DISCLOSED tail), the same third
    // honesty class as Scapegoat's rebuild-absorbed set/delete -- and get, uniquely, is an
    // amortized (not worst-case) READ. Mislabelling any as worst-case or expected BITES.
    for (const op of ['Scapegoat.set', 'Scapegoat.delete', 'SplayTree.get', 'SplayTree.set', 'SplayTree.delete']) {
        assert.equal(OP_CLASS[op], OLOGN_AMORTIZED, op + ' must be the AMORTIZED class string');
        assert.ok(!/worst-case/.test(OP_CLASS[op]), op + ' must not be labelled worst-case (amortized)');
        assert.ok(!/expected/.test(OP_CLASS[op]), op + ' must not be labelled expected (it is DETERMINISTIC, no RNG)');
    }
    // Full-teeth partition: every OP_CLASS key is accounted for by EXACTLY one of the three
    // lists below (worst union expected union amortized == all keys, disjoint) -- a new/renamed op
    // not wired into any list here would otherwise pass unnoticed.
    const worstOps = ['BinaryHeap.push', 'BinaryHeap.pop', 'Fenwick.update', 'Fenwick.prefix', 'SegmentTree.update', 'SegmentTree.query', 'Scapegoat.get', 'MinMaxHeap.push', 'MinMaxHeap.popMin', 'MinMaxHeap.popMax'];
    const expectedOps = ['SkipList.get', 'SkipList.set', 'SkipList.delete', 'Treap.get', 'Treap.set', 'Treap.delete'];
    const amortizedOps = ['Scapegoat.set', 'Scapegoat.delete', 'SplayTree.get', 'SplayTree.set', 'SplayTree.delete'];
    assert.deepEqual([...worstOps, ...expectedOps, ...amortizedOps].sort(), Object.keys(OP_CLASS).sort(),
        'every OP_CLASS key must be asserted as WORST, EXPECTED or AMORTIZED above (no silent gap)');
});

test('#3 CLEAR_WITNESS is EXACTLY the eight SUBJECTS; NodePool is EXCLUDED with a reason; each has a real clear()', () => {
    assert.deepEqual(CLEAR_WITNESS, SUBJECTS, 'the clear() witness set must be exactly SUBJECTS (8)');
    assert.equal(CLEAR_WITNESS.length, 8, 'exactly eight members');
    // Adding NodePool (the private free-list) to the set would break the SUBJECTS equality above.
    assert.ok(!CLEAR_WITNESS.includes('NodePool'), 'the private NodePool is NOT a clear() witness');
    assert.ok(typeof CLEAR_WITNESS_EXCLUDED.NodePool === 'string' && CLEAR_WITNESS_EXCLUDED.NodePool.length > 0,
        'NodePool must be named in the EXCLUDED table with a reason (never silently dropped)');
    for (const m of CLEAR_WITNESS) {
        const { obj } = makeSubject(m, 256);
        assert.equal(typeof obj.clear, 'function', m + ' must expose a real clear()');
    }
});

test('#3 clearWitness probe: the eight members reach size/content 0 + zero-alloc + reusable', () => {
    const cw = clearWitness({ n: 512, cycles: 200 });
    assert.deepEqual(cw.members, CLEAR_WITNESS);
    for (const m of CLEAR_WITNESS) {
        const r = cw.results[m];
        assert.equal(r.sizeAfterClear, 0, m + ' content must be 0 after clear');
        assert.ok(r.pristine, m + ' must be pristine after clear');
        assert.ok(r.reusable, m + ' must be reusable after clear (refill brings content back up)');
        assert.ok(r.refilledTo > 0, m + ' refill must be non-vacuous (content > 0)');
        assert.equal(r.bytesDelta, 0, m + ' backing store must not grow across cycles (zero-alloc)');
        assert.ok(r.zeroAlloc, m + ' clear-witness must report zero-alloc');
    }
});

test('#3 clearWitness is NON-VACUOUS: it calls each member\'s REAL prototype clear() exactly cycles+2 times', () => {
    const CLASSES = { BinaryHeap, Fenwick, SegmentTree, SkipList, Treap, Scapegoat, MinMaxHeap, SplayTree };
    assert.deepEqual(Object.keys(CLASSES).sort(), [...CLEAR_WITNESS].sort(),
        'the spy table must cover exactly the CLEAR_WITNESS members');
    const counts = {}; const originals = {};
    for (const m of CLEAR_WITNESS) {
        counts[m] = 0;
        originals[m] = CLASSES[m].prototype.clear;
        assert.equal(typeof originals[m], 'function', m + ' must have a real clear() to spy on');
        CLASSES[m].prototype.clear = function (...args) { counts[m]++; return originals[m].apply(this, args); };
    }
    try {
        const cycles = 37; // odd, non-default: a coincidental match is astronomically unlikely
        const cw = clearWitness({ n: 64, cycles });
        assert.equal(cw.members.length, 8);
        for (const m of CLEAR_WITNESS) {
            assert.equal(counts[m], cycles + 2,
                m + ' clearWitness must invoke the REAL prototype clear() exactly cycles+2 times ' +
                '(1 initial + ' + cycles + ' loop + 1 final); a stubbed probe reads 0 here');
        }
    } finally {
        for (const m of CLEAR_WITNESS) CLASSES[m].prototype.clear = originals[m];
    }
    for (const m of CLEAR_WITNESS) assert.equal(CLASSES[m].prototype.clear, originals[m], m + ' clear() must be restored');
});

test('#3 retention: 1000 clear->refill cycles leave content 0 + free-list restored + no memberBytes growth', () => {
    for (const m of CLEAR_WITNESS) {
        const { obj } = makeSubject(m, 1024);
        const base = memberBytes(m, obj);
        assert.ok(base > 0, m + ' backing bytes must be positive');
        for (let c = 0; c < 1000; c++) {
            obj.clear();
            if (m === 'BinaryHeap') { assert.equal(obj.size, 0, m + ' size 0 after clear (cycle ' + c + ')'); for (let k = 0; k < 512; k++) obj.push(k, k); }
            else if (m === 'SkipList') { assert.equal(obj.size, 0, m + ' size 0 after clear (cycle ' + c + ')'); for (let k = 0; k < 512; k++) obj.set(k, k); }
            else if (m === 'Treap') { assert.equal(obj.size, 0, m + ' size 0 after clear (cycle ' + c + ')'); for (let k = 0; k < 512; k++) obj.set(k, k); }
            else if (m === 'Scapegoat') { assert.equal(obj.size, 0, m + ' size 0 after clear (cycle ' + c + ')'); for (let k = 0; k < 512; k++) obj.set(k, k); }
            else if (m === 'MinMaxHeap') { assert.equal(obj.size, 0, m + ' size 0 after clear (cycle ' + c + ')'); for (let k = 0; k < 512; k++) obj.push(k, k); }
            else if (m === 'SplayTree') { assert.equal(obj.size, 0, m + ' size 0 after clear (cycle ' + c + ')'); for (let k = 0; k < 512; k++) obj.set(k, k); }
            else if (m === 'Fenwick') { assert.equal(obj.prefix(obj.length - 1), 0, m + ' accumulator 0 after clear'); for (let i = 0; i < obj.length; i++) obj.update(i, 1); }
            else { assert.equal(obj.query(0, obj.length - 1), 0, m + ' accumulator 0 after clear'); for (let i = 0; i < obj.length; i++) obj.update(i, 1); }
        }
        obj.clear();
        assert.equal(memberBytes(m, obj), base, m + ' memberBytes delta must be exactly 0 across 1000 cycles');
    }
    // SkipList free-list restored: after clear(), a full refill to capacity succeeds (a leaked
    // free-list would overflow / drop). makeSubject builds SkipList(n+1); refill n keys -> size n.
    const { obj: sl } = makeSubject('SkipList', 1024);
    sl.clear();
    for (let k = 0; k < 1024; k++) sl.set(k, k);
    assert.equal(sl.size, 1024, 'SkipList free-list must be fully restored after clear (refill to n)');
});

test('#4 CLAIM_CLASS classifier: alloc keeps "proven" (torture/0 B-op), timing softens, cited=Pugh keeps', () => {
    assert.deepEqual(Object.keys(CLAIM_CLASS).sort(), ['alloc', 'cited', 'timing']);
    assert.equal(classifyClaim('the torture gate proves every timed op-row at 0 B/op'), CLAIM_CLASS.alloc);
    assert.equal(classifyClaim('byte-identical clear() leaves the backing store untouched'), CLAIM_CLASS.alloc);
    assert.equal(classifyClaim('Pugh 1990 proved the skip list is EXPECTED O(log n)'), CLAIM_CLASS.cited);
    // A timing/complexity claim is class timing -> MUST NOT read "proven".
    assert.equal(classifyClaim('the witness proves the straight O(log n) line'), CLAIM_CLASS.timing);
    assert.equal(classifyClaim('the slope band is the proof of one level per doubling'), CLAIM_CLASS.timing);
});

test('#4 doc gate: 0 timing-class "prove*" in METHODOLOGY/Report; the alloc claim keeps "proven"', () => {
    for (const [name, text] of [['benchmark/METHODOLOGY.md', METHODOLOGY_SRC], ['benchmark/Report.mjs', REPORT_SRC]]) {
        for (const line of text.split('\n')) {
            if (!PROVE_RE.test(line)) continue;
            assert.notEqual(classifyClaim(line), CLAIM_CLASS.timing,
                name + ' has a timing-class "prove*" claim (must read witness/empirical): ' + line.trim().slice(0, 90));
        }
    }
    // POSITIVE anchor: the deterministic 0-B/op alloc claim STILL keeps "proven" in METHODOLOGY.
    // Softening it (prove -> witness) drops this count to 0 -> FAIL.
    const allocProven = METHODOLOGY_SRC.split('\n').filter((l) => PROVE_RE.test(l) && /0 ?B\/op/i.test(l) && classifyClaim(l) === CLAIM_CLASS.alloc);
    assert.ok(allocProven.length >= 1, 'the torture/perf "proves ... 0 B/op" alloc claim must survive in METHODOLOGY');
});

test('#5 report: D6 + D8 render ADJACENT to the O(log n) witness plot; clear + per-op witnesses sit with them', () => {
    const opsFor = (m) => OP_ROWS.filter((k) => k.slice(0, k.indexOf('.')) === m).map((k) => k.slice(k.indexOf('.') + 1));
    const fakeCell = (m, dim) => {
        if (dim === 'D1') {
            const ops = opsFor(m).map((op) => ({ op, r2: 0.99, slope: 5, slopeLo: 1, slopeHi: 10, onLine: true, foilR2: 0.4, foilOff: true, foilName: 'O(n) foil' }));
            const cell = { ops };
            if (m === 'SkipList') { cell.counterFoil = { name: 'Map', getNsPerOp: 1, cannotAnswer: ['successor', 'predecessor', 'rangeIter'] }; cell.maxSingleOp = 9; }
            else cell.counterFoil = 'n/a';
            return cell;
        }
        if (dim === 'D2') return { points: [{ ops: 1000, nsPerOp: 1 }, { ops: 2000, nsPerOp: 1 }], drift: 1 };
        if (dim === 'D3') return { bytesPerLive: 8, theoreticalMinPerLive: 8, peakBackingBytes: 1024, overheadRatio: 1, loadFactorCurve: [{ overheadRatio: 1, loadFactor: 0.25, bytesPerLive: 8 }], heapAfterClearKB: 0 };
        if (dim === 'D4') return { strideSweep: [{ workingSet: 1000, nsPerElem: 1 }], denseNsPerOp: 1, randomNsPerOp: 1, gap: 1 };
        if (dim === 'D5') return { single: { min: 100, gzip: 50 }, all: { min: 1000, gzip: 500 }, ratio: 0.1, underForty: true };
        if (dim === 'D6') return { perOp: opsFor(m).map((op) => ({ op, zeroAlloc: true, points: [{ opsPerMs: 1 }] })) };
        if (dim === 'D7') return { keyTypes: { int: 1, string: 'n/a', object: 'n/a' }, loadFactors: [{ nsPerOp: 1 }], nearFullNs: 1, insertionOrder: 'n/a' };
        return { churn: { nsPerOp: 1 }, ordered: 'n/a' }; // D8
    };
    const results = {};
    for (const m of SUBJECTS) for (const d of DIMENSIONS) results[m + '/' + d] = fakeCell(m, d);
    const payload = {
        meta: { seed: 1, node: 'v', arch: 'a', platform: 'p', date: 'd' },
        subjects: SUBJECTS, dimensions: DIMENSIONS, results,
        clearWitness: clearWitness({ n: 256, cycles: 20 }),
        clearWitnessExcluded: CLEAR_WITNESS_EXCLUDED,
        opClass: OP_CLASS,
    };
    const html = renderHtml(payload);
    const iD1 = html.indexOf('D1 -- O(log n) Witness fit');
    const iD2 = html.indexOf('D2 -- Amortized cost');
    const iClear = html.indexOf('clear() invariance witness');
    const iOp = html.indexOf('Per-op honesty class');
    const iD6 = html.indexOf('D6 -- GC pressure');
    const iD8 = html.indexOf('D8 -- Workload micro-benchmarks');
    const iD3 = html.indexOf('D3 -- Memory footprint');
    for (const [n, i] of [['D1', iD1], ['D2', iD2], ['clear', iClear], ['opClass', iOp], ['D6', iD6], ['D8', iD8], ['D3', iD3]]) {
        assert.ok(i > 0, n + ' section must render (removing it FAILS)');
    }
    // Adjacency: the witness plot (D1/D2), then the clear + per-op witnesses, then D6 + D8,
    // ALL before D3 -- so the corroboration sits next to the witness, not buried after memory.
    assert.ok(iD1 < iD2 && iD2 < iClear && iClear < iOp && iOp < iD6 && iD6 < iD8,
        'order must be D1 -> D2 -> clear -> per-op -> D6 -> D8');
    assert.ok(iD8 < iD3, 'D6 + D8 must render BEFORE D3 (adjacent to the witness plot)');
    // Honesty: the SkipList counter-foil O(log n)/O(1) contrast + n/a cells render as strings.
    assert.ok(html.includes('n/a'), 'inapplicable cells must render the n/a string');
    // The per-op honesty table labels every gated row O(log n) (never O(1)).
    assert.ok(html.includes('O(log n) worst-case') && html.includes('O(log n) expected'),
        'the per-op honesty table must render the O(log n) classes');
});

test('#5 report: clear() witness cycle count in the prose is n/a (never 0) when the witness is degenerate', () => {
    // Reviewer NIT 2: a display-only `: 0` fallback in a file that otherwise holds the
    // n/a-never-0 convention is a fail-open pattern for an unverified state (empty members
    // means the cycle count is UNKNOWN, not zero). Exercise the degenerate branch directly.
    const html = renderHtml({
        meta: { seed: 1, node: 'v', arch: 'a', platform: 'p', date: 'd' },
        subjects: [], dimensions: [], results: {},
        clearWitness: { members: [], results: {} },
        clearWitnessExcluded: {},
        opClass: {},
    });
    const i = html.indexOf('clear() invariance witness');
    assert.ok(i > 0, 'the clear() witness section must still render on an empty members array');
    const snippet = html.slice(i, i + 400);
    assert.ok(/n\/a fill\/clear cycles/.test(snippet),
        'a degenerate (empty-members) clear witness must report the cycle count as n/a, not 0: ' + snippet);
    assert.ok(!/[^0-9]0 fill\/clear cycles/.test(snippet),
        'the cycle count must never silently read 0 for an unverified/degenerate witness');
});

test('#6 shipping discipline: package.json.version is 0.8.0; benchmark/ stays repo-only', () => {
    const pkg = JSON.parse(readFileSync(new URL('../package.json', import.meta.url), 'utf8'));
    assert.equal(pkg.version, '0.8.0', 'the SplayTree release: version is 0.8.0');
    assert.ok(!pkg.files.includes('benchmark'), 'benchmark/ must not appear in package.json files[]');
});

// ===========================================================================
// Bench v3 SHARED Template mechanisms (copied verbatim) -- smoke + fail-closed.
// ===========================================================================

test('v3 SPIKE_TAGS + attributeMax + bandOf + paretoFrontier + sparseTax: pure, fail-closed', () => {
    assert.deepEqual(SPIKE_TAGS, ['steady', 'grow', 'wrap', 'cascade', 'compress', 'reseed']);
    assert.ok(Object.isFrozen(SPIKE_TAGS));
    assert.equal(SPIKE_TAGS[0], 'steady', 'lane byte 0 is steady');
    for (const t of SPIKE_TAGS) assert.equal(assertTag(t), t);
    assert.throws(() => assertTag('bogus'), /\[template\] unknown spike tag/);
    assert.equal(tagByte('cascade'), 3);
    const lane = new Uint8Array([0, 0, tagByte('cascade'), 0]);
    assert.deepEqual(attributeMax(lane, 2, 100, 10), { maxIndex: 2, tag: 'cascade', spikeRatio: 10 });
    assert.equal(attributeMax(lane, 0, 5, 5).tag, 'steady');
    assert.throws(() => attributeMax(lane, 9, 1, 1), /maxIndex out of range/);
    assert.throws(() => attributeMax(new Uint8Array([99]), 0, 1, 1), /outside the frozen enum/);
    // Cache bands: exact nominal thresholds, fail closed on garbage.
    assert.equal(bandOf(32 * 1024), 'L1');
    assert.equal(bandOf(32 * 1024 + 1), 'L2');
    assert.equal(bandOf(33 * 1024 * 1024), 'DRAM');
    assert.equal(CACHE_BANDS.L1, 32 * 1024);
    assert.throws(() => bandOf(-1), /non-negative finite/);
    // Pareto dominance filter over a known fixture.
    const front = paretoFrontier([
        { member: 'A', opsPerMs: 100, bytesPerLive: 10 },
        { member: 'B', opsPerMs: 50, bytesPerLive: 20 },
        { member: 'C', opsPerMs: 40, bytesPerLive: 5 },
        { member: 'D', opsPerMs: 120, bytesPerLive: 30 },
    ]).map((p) => p.member).sort();
    assert.deepEqual(front, ['A', 'C', 'D']);
    assert.equal(sparseTax([{ loadFactor: 0.25, bytesPerLive: 40 }, { loadFactor: 1.0, bytesPerLive: 10 }]), 4);
    assert.equal(sparseTax([{ loadFactor: 0.5, bytesPerLive: 5 }]), 'n/a');
});
