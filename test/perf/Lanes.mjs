/**
 * @zakkster/lite-logn -- the KIND-crossed allocation ORCHESTRATOR (stage G, G6).
 *
 *   node test/perf/Lanes.mjs            # the kinds run  (test:perf:kinds)
 *   node test/perf/Lanes.mjs noinline   # the N3 run     (test:perf:noinline)
 *
 * Spawns one child process PER SHARD, in parallel, each running
 *   node <shard flags> --expose-gc --test test/perf/Kinds.test.mjs
 * with LOGN_SHARD set. Shard flags PIN the new-space (--min == --max semi-space) and
 * disable concurrent recompilation, so the one-box scale is stable and a background
 * recompile cannot flip a lane's boxing between runs; the noinline shard adds
 * --max-inlined-bytecode-size=0. The kinds run covers every member group + the
 * N2-warmed twin + the p30 (N5) proxy; the noinline run is the full matrix under N3.
 *
 * Each child prints LANE / CALIB / CALIBEND lines. This aggregates them, ENFORCES
 * that every shard emitted its expected cell count with a CALIB header (a silent
 * empty shard is a gate hole), prints the red / green table, and EXITS NONZERO if
 * any shard's gate failed OR any shard is malformed. On 1.3.0 it exits non-zero (the
 * F3 / F4 / F10 lanes are red), the stage-G exit criterion. Wall-clock: <= 180 s.
 *
 * REPO-ONLY dev infra: not in package.json files[]. Never widens a budget.
 */

import { spawn } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import path from 'node:path';
import { SHARDS, SHARDS_KINDS, SHARDS_NOINLINE, expectedCells } from './Kinds.mjs';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(HERE, '..', '..');
// QA self-test hook (DEFAULT OFF): LOGN_LANES_SELFTEST=<shardId>:<absolute fake shard
// script>. Runs ONLY that shard, with the fake script in place of Kinds.test.mjs, so
// test/perf/Harness.test.mjs can prove the malformed-shard checks below fail closed. No
// npm script sets it; an active hook is announced on stderr. The real gate file is never
// run under it, so it cannot produce a partial green of the real gate.
const SELFTEST = process.env.LOGN_LANES_SELFTEST || '';
const ST_COLON = SELFTEST.indexOf(':');
const TEST_FILE = SELFTEST ? SELFTEST.slice(ST_COLON + 1) : 'test/perf/Kinds.test.mjs';
if (SELFTEST) process.stderr.write('Lanes: SELFTEST HOOK ACTIVE (' + SELFTEST + ') -- not a gate run\n');

const MODE = process.argv[2] === 'noinline' ? 'noinline' : 'kinds';
const shardIds = SELFTEST ? [SELFTEST.slice(0, ST_COLON)] : (MODE === 'noinline' ? SHARDS_NOINLINE : SHARDS_KINDS);

// The child env never carries the Kinds.mjs LOGN_INJECT hook: an orchestrated run is
// always the real registry.
function childEnv(shardId) {
    const env = { ...process.env, LOGN_SHARD: shardId };
    delete env.LOGN_INJECT;
    return env;
}

function runShard(shardId) {
    const sh = SHARDS[shardId];
    const args = ['--expose-gc', ...sh.flags, '--test', TEST_FILE];
    return new Promise((resolve) => {
        const child = spawn(process.execPath, args, {
            cwd: ROOT,
            env: childEnv(shardId),
            stdio: ['ignore', 'pipe', 'pipe'],
        });
        let out = '';
        let err = '';
        child.stdout.on('data', (d) => { out += d; });
        child.stderr.on('data', (d) => { err += d; });
        child.on('close', (code) => {
            const lanes = [];
            let calib = null, calibEnd = null;
            for (const line of out.split('\n')) {
                if (line.startsWith('LANE\t')) {
                    const p = line.split('\t');
                    lanes.push({ shard: p[1], id: p[2], kind: p[3], io: p[4], scav: +p[5], budget: +p[6], verdict: p[7], fid: p[8] });
                } else if (line.startsWith('CALIB\t')) { calib = line; }
                else if (line.startsWith('CALIBEND\t')) { calibEnd = line; }
            }
            resolve({ shardId, code, lanes, calib, calibEnd, err });
        });
    });
}

const t0 = Date.now();
const results = await Promise.all(shardIds.map(runShard));
const wallMs = Date.now() - t0;

// ---- assemble + integrity checks (blocker 8) ----
const allLanes = [];
const calibs = [];
let anyFail = false;
const malformed = [];
for (const r of results) {
    if (r.calib) calibs.push(r.calib);
    for (const l of r.lanes) allLanes.push(l);
    if (r.code !== 0) anyFail = true;
    if (r.err && r.err.trim()) process.stderr.write('[shard ' + r.shardId + ' stderr]\n' + r.err + '\n');
    const exp = expectedCells(r.shardId);
    if (!r.calib) malformed.push(r.shardId + ': missing CALIB header');
    if (!r.calibEnd) malformed.push(r.shardId + ': missing CALIBEND (drift re-check) line');
    if (r.lanes.length === 0) malformed.push(r.shardId + ': emitted 0 LANE lines');
    else if (r.lanes.length !== exp) malformed.push(r.shardId + ': emitted ' + r.lanes.length + ' cells, expected ' + exp);
}

const red = allLanes.filter((l) => l.verdict === 'FAIL' || l.verdict === 'UNDEFER');
const green = allLanes.filter((l) => l.verdict === 'PASS');
const deferred = allLanes.filter((l) => l.verdict === 'DEFER');

// ---- human summary ----
process.stdout.write('\n=== lite-logn Kinds gate (' + MODE + ') ===\n');
for (const c of calibs) process.stdout.write(c + '\n');
process.stdout.write('\nshards: ' + shardIds.join(', ') + '\n');
process.stdout.write('lanes:  ' + allLanes.length + ' total, ' + green.length + ' green, ' +
    red.length + ' red, ' + deferred.length + ' deferred\n');
process.stdout.write('wall:   ' + (wallMs / 1000).toFixed(1) + ' s (budget <= 180 s)\n');
if (malformed.length) { process.stdout.write('MALFORMED SHARDS:\n'); for (const m of malformed) process.stdout.write('  ' + m + '\n'); }
process.stdout.write('\n');

if (deferred.length) {
    process.stdout.write('DEFERRED to 1.4.1 (RED, but its fix is deferred -- passes):\n');
    for (const l of deferred) {
        process.stdout.write('  ' + l.id.padEnd(30) + ' ' + l.kind.padEnd(5) + ' ' + l.shard.padEnd(12) +
            ' scav=' + String(l.scav).padStart(4) + ' budget=' + l.budget + ' -> ' + (l.fid || 'deferred') + '\n');
    }
    process.stdout.write('\n');
}

if (red.length) {
    process.stdout.write('RED (scavenges > budget, NOT deferred -- a gate failure):\n');
    for (const l of red) {
        process.stdout.write('  ' + l.id.padEnd(30) + ' ' + l.kind.padEnd(5) + ' ' + l.shard.padEnd(10) +
            ' scav=' + String(l.scav).padStart(4) + ' budget=' + l.budget + ' (' + l.io + ') ' + l.verdict + '\n');
    }
    process.stdout.write('\n');
}

// ---- markdown table to stdout (TABLE ... ENDTABLE), captured by G-EXIT ----
process.stdout.write('TABLE\n');
process.stdout.write('| lane | kind | shard/state | io | scavenges | budget | verdict |\n');
process.stdout.write('| --- | --- | --- | --- | --- | --- | --- |\n');
for (const l of allLanes) {
    process.stdout.write('| ' + l.id + ' | ' + l.kind + ' | ' + l.shard + ' | ' + l.io + ' | ' +
        l.scav + ' | ' + l.budget + ' | ' + l.verdict + ' |\n');
}
process.stdout.write('ENDTABLE\n');

if (malformed.length) {
    process.stderr.write('Lanes: FAIL -- ' + malformed.length + ' malformed shard(s); a silent/short shard is a gate hole\n');
    anyFail = true;
}
if (wallMs > 180000) {
    process.stderr.write('Lanes: FAIL -- wall-clock ' + (wallMs / 1000).toFixed(1) + ' s exceeds the 180 s budget\n');
    anyFail = true;
}

process.exitCode = anyFail ? 1 : 0;
