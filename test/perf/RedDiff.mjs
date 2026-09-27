/**
 * @zakkster/lite-logn -- RED-set DIFF tool for the Kinds / noinline gates.
 *
 *   node test/perf/RedDiff.mjs               # diff BOTH kinds + noinline vs G-EXIT
 *   node test/perf/RedDiff.mjs kinds         # just the kinds run
 *   node test/perf/RedDiff.mjs noinline      # just the noinline run
 *   node test/perf/RedDiff.mjs kinds run.txt # parse a saved Lanes.mjs run instead of spawning
 *
 * Runs (or parses) a Kinds gate and prints the cells that flipped RED->GREEN and
 * GREEN->RED versus the recorded baseline in G-EXIT-1.3.0.md. Later stages use it to
 * PROVE a fix turns exactly the expected lanes green (and nothing else moves). It is a
 * diagnostic, NOT a pass/fail gate -- the red set is meant to SHRINK as fixes land, so
 * it always exits 0 and is deliberately kept OUT of `verify`. (npm: test:perf:reddiff)
 *
 * REPO-ONLY dev infra: not in package.json files[].
 */

import { spawnSync } from 'node:child_process';
import { fileURLToPath, pathToFileURL } from 'node:url';
import fs from 'node:fs';
import path from 'node:path';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(HERE, '..', '..');
const GEXIT = path.join(HERE, 'G-EXIT-1.3.0.md');
const LANES_JS = path.join(HERE, 'Lanes.mjs');

// Parse the markdown rows of a G-EXIT "## <section> run" section.
function gexitRows(section) {
    const md = fs.readFileSync(GEXIT, 'utf8').split('\n');
    const rows = [];
    let on = false;
    for (const line of md) {
        if (line.indexOf('## ') === 0) { on = line.indexOf('## ' + section + ' run') === 0; continue; }
        if (!on || line.indexOf('| ') !== 0 || line.indexOf('| lane') === 0 || line.indexOf('| ---') === 0) continue;
        rows.push(line.trim());
    }
    return rows;
}

// Parse the TABLE...ENDTABLE block Lanes.mjs prints on stdout.
function runRows(text) {
    const rows = [];
    let on = false;
    for (const line of text.split('\n')) {
        if (line === 'TABLE') { on = true; continue; }
        if (line === 'ENDTABLE') { on = false; continue; }
        if (on && line.indexOf('| ') === 0 && line.indexOf('| lane') !== 0 && line.indexOf('| ---') !== 0) rows.push(line.trim());
    }
    return rows;
}

// key = lane|kind|shard; a row is RED iff its verdict cell is FAIL.
export const key = (r) => { const p = r.split('|').map((s) => s.trim()); return p[1] + '|' + p[2] + '|' + p[3]; };
// A cell is RED if its verdict is FAIL, or DEFER / UNDEFER (still boxing, only DEFERRED to 1.4.1):
// so "the only remaining REDs are exactly the DEFERRED entries" is a diffable property vs G-EXIT.
export const redSet = (rows) => new Set(rows.filter((r) => /\s(FAIL|DEFER|UNDEFER)\s\|$/.test(r)).map(key));

// Pure diff over two row arrays (exported for the harness self-test). A G-EXIT cell the
// run did not emit is MISSING, NOT a flip: splitting it out keeps RED->GREEN honest, so a
// dropped/renamed lane can never masquerade as a fix. redMissing = was RED and vanished;
// greenMissing = was GREEN and vanished.
export function computeDiff(exp, got) {
    const E = redSet(exp);
    const G = redSet(got);
    const allE = new Set(exp.map(key));
    const allG = new Set(got.map(key));
    const missing = [...allE].filter((x) => !allG.has(x));
    return {
        nowGreen: [...E].filter((x) => allG.has(x) && !G.has(x)),   // RED -> GREEN (present + green)
        nowRed: [...G].filter((x) => !E.has(x)),                    // was GREEN/absent -> RED now
        redMissing: missing.filter((x) => E.has(x)),
        greenMissing: missing.filter((x) => !E.has(x)),
        expRed: E.size,
        gotRed: G.size,
    };
}

function diffSection(section, runText) {
    const exp = gexitRows(section);
    const got = runRows(runText);
    const d = computeDiff(exp, got);
    process.stdout.write('\n=== ' + section + ' ===\n');
    process.stdout.write('  G-EXIT: ' + exp.length + ' cells, ' + d.expRed + ' red | run: ' + got.length + ' cells, ' + d.gotRed + ' red\n');
    process.stdout.write('  RED->GREEN (' + d.nowGreen.length + '): ' + (d.nowGreen.join(', ') || 'none') + '\n');
    process.stdout.write('  GREEN->RED (' + d.nowRed.length + '): ' + (d.nowRed.join(', ') || 'none') + '\n');
    process.stdout.write('  RED->MISSING (' + d.redMissing.length + '): ' + (d.redMissing.join(', ') || 'none') + '\n');
    process.stdout.write('  GREEN->MISSING (' + d.greenMissing.length + '): ' + (d.greenMissing.join(', ') || 'none') + '\n');
    process.stdout.write('  diff: ' + d.nowGreen.length + '/' + d.nowRed.length + ' (missing ' + d.redMissing.length + '/' + d.greenMissing.length + ')\n');
    return d;
}

function runLanes(mode) {
    const args = mode === 'noinline' ? [LANES_JS, 'noinline'] : [LANES_JS];
    const res = spawnSync(process.execPath, args, { cwd: ROOT, encoding: 'utf8', maxBuffer: 64 * 1024 * 1024 });
    return (res.stdout || '') + (res.stderr || '');
}

// Only run the diff when invoked directly (`node test/perf/RedDiff.mjs`), not when
// imported by the harness self-test (which exercises computeDiff on synthetic rows).
const INVOKED_DIRECTLY = process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href;
if (INVOKED_DIRECTLY) {
    const arg = process.argv[2];
    const fileArg = process.argv[3];
    const sections = arg === 'kinds' || arg === 'noinline' ? [arg] : ['kinds', 'noinline'];
    for (const section of sections) {
        const text = fileArg ? fs.readFileSync(fileArg, 'utf8') : runLanes(section);
        diffSection(section, text);
    }
    process.exitCode = 0;   // diagnostic, never a gate
}
