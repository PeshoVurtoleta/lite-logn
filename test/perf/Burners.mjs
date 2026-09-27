/**
 * @zakkster/lite-logn -- the CPU-contention burner harness (N6 / G10).
 *
 *   npm run test:perf:burn        # RELEASE ONLY -- not in `verify`
 *
 * F12 (the 2/71 perf-gate flake the 1.3.0 audit saw once) did NOT reproduce (ROADMAP
 * 8.1 / S8). N6 keeps it as release-time evidence, not a per-commit gate: spawn
 * os.availableParallelism() CPU burners to saturate every core, then run
 * `npm run test:perf` 3x under that load. A run that FAILS under contention is the
 * F12 signal; 3 green runs are the evidence the chunked Float64Array driver holds.
 *
 * REPO-ONLY dev infra: not in package.json files[]. Never widens a budget.
 */

import { spawn, spawnSync } from 'node:child_process';
import os from 'node:os';
import { fileURLToPath } from 'node:url';
import path from 'node:path';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..');
const BURNERS = os.availableParallelism ? os.availableParallelism() : os.cpus().length;
const RUNS = 3;

// A burner: a detached node process in a tight arithmetic spin (no allocation, so it
// contends for CPU, not memory). Kept alive by stdin; killed at the end.
function spawnBurner() {
    return spawn(process.execPath, ['-e', 'let x=0;for(;;){x=(x*1103515245+12345)>>>0;if(x===0xffffffff)console.error(x);}'],
        { stdio: 'ignore', detached: false });
}

const burners = [];
for (let i = 0; i < BURNERS; i++) burners.push(spawnBurner());
process.stdout.write('Burners: ' + BURNERS + ' CPU burners up; running `npm run test:perf` ' + RUNS + 'x under load\n');

let failures = 0;
try {
    for (let r = 1; r <= RUNS; r++) {
        const t0 = Date.now();
        const res = spawnSync('npm', ['run', 'test:perf'], { cwd: ROOT, stdio: 'inherit' });
        const ok = res.status === 0;
        if (!ok) failures++;
        process.stdout.write('Burners: run ' + r + '/' + RUNS + ' -> ' + (ok ? 'PASS' : 'FAIL (status ' + res.status + ')') +
            ' in ' + ((Date.now() - t0) / 1000).toFixed(1) + ' s\n');
    }
} finally {
    for (const b of burners) { try { b.kill('SIGKILL'); } catch { /* already gone */ } }
}

if (failures) {
    process.stderr.write('Burners: FAIL -- ' + failures + '/' + RUNS + ' test:perf runs failed under ' + BURNERS + '-core contention (F12 reproduced)\n');
    process.exitCode = 1;
} else {
    process.stdout.write('Burners: ok -- ' + RUNS + '/' + RUNS + ' green under ' + BURNERS + '-core contention\n');
}
