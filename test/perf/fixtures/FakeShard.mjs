/**
 * @zakkster/lite-logn -- a FAKE shard for test/perf/Harness.test.mjs.
 *
 * Run by test/perf/Lanes.mjs ONLY under its LOGN_LANES_SELFTEST hook (default off), in
 * place of Kinds.test.mjs. It measures nothing: it prints the LANE / CALIB / CALIBEND
 * protocol for LOGN_SHARD, well-formed or malformed per LOGN_FAKE_MODE, so the
 * orchestrator's integrity checks can be proven to fail closed.
 *
 * REPO-ONLY dev infra: not in package.json files[].
 */

import { expectedCells, lanesForShard, kindsFor, SHARDS } from '../Kinds.mjs';

const SHARD = process.env.LOGN_SHARD;
// If the orchestrator leaked the Kinds.mjs LOGN_INJECT hook into this child, go
// malformed (drop CALIB) so Lanes.mjs fails: the leak becomes visible as a red run.
const MODE = process.env.LOGN_INJECT ? 'nocalib' : (process.env.LOGN_FAKE_MODE || 'ok');
const exp = expectedCells(SHARD);
let n = exp;
if (MODE === 'zero') n = 0;
else if (MODE === 'short') n = exp - 1;
else if (MODE === 'long') n = exp + 1;

const cells = [];
for (const l of lanesForShard(SHARD)) for (const k of kindsFor(l, SHARDS[SHARD].kinds)) cells.push(l.id + '\t' + k);
let out = '';
if (MODE !== 'nocalib') out += 'CALIB\t' + SHARD + '\tB1=12\tZERO=2\tONE=18\tnoinline=false\tflags=ok\n';
for (let i = 0; i < n; i++) {
    const c = MODE === 'dup' ? cells[0] : cells[i % cells.length];
    out += 'LANE\t' + SHARD + '\t' + c + '\tk0\t0\t2\tPASS\n';
}
if (MODE !== 'nocalibend') out += 'CALIBEND\t' + SHARD + '\tB1late=12\ttwoLate=24\n';
process.stdout.write(out);
if (MODE === 'exit1') process.exitCode = 1;
