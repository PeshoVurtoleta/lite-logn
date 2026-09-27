/**
 * @zakkster/lite-logn -- V8/Node execArgv flag parser for the allocation gates.
 *
 * V8 resolves a repeated flag to its LAST occurrence, and treats `_` and `-` in a
 * flag name as identical. A textual regex over execArgv.join(' ') sees the FIRST
 * `=0` and cannot tell that a later `--max-inlined-bytecode-size=460` re-enabled
 * inlining, nor that a later `--concurrent-recompilation` undid an earlier
 * `--no-concurrent-recompilation`. This parser resolves flags the way V8 does:
 *   - normalize `_` -> `-` in flag names;
 *   - accept both `--flag=value` and `--flag value` (numeric value form);
 *   - a `--no-<bool>` sets that boolean false; a bare `--<bool>` sets it true;
 *   - the LAST occurrence of each flag wins.
 *
 * Shared by test/perf/Kinds.test.mjs (pinned + single-tier + noinline audits) and
 * test/torture.mjs (semi-space pin assert). REPO-ONLY dev infra: not in files[].
 */

// Parse an execArgv array into a Map<canonicalName, value>. value is a string for
// `=`/space-valued flags, `true` for a bare boolean, `false` for a `--no-` boolean.
export function parseFlags(argv) {
    const m = new Map();
    for (let i = 0; i < argv.length; i++) {
        const raw = argv[i];
        if (raw.slice(0, 2) !== '--') continue;
        let body = raw.slice(2).replace(/_/g, '-');
        let name, val;
        const eq = body.indexOf('=');
        if (eq !== -1) {
            name = body.slice(0, eq);
            val = body.slice(eq + 1);
        } else {
            name = body;
            const next = argv[i + 1];
            if (next !== undefined && /^[0-9]/.test(next)) { val = next; i++; }
            else val = true;
        }
        if (name.slice(0, 3) === 'no-') { name = name.slice(3); val = false; }
        m.set(name, val);                    // LAST occurrence wins (as V8 resolves it)
    }
    return m;
}

// The canonical (normalized) name of a `--flag` / `--flag=value` token, or '' if the
// token is not a flag. `--no-` is stripped so a boolean and its negation share a name.
export function flagName(raw) {
    if (raw.slice(0, 2) !== '--') return '';
    const eq = raw.indexOf('=');
    let name = (eq !== -1 ? raw.slice(2, eq) : raw.slice(2)).replace(/_/g, '-');
    if (name.slice(0, 3) === 'no-') name = name.slice(3);
    return name;
}

// Rebuild an execArgv array with the min/max semi-space pins removed, in ANY spelling
// (underscore or dash) and ANY form (--flag=value or --flag value). The torture re-exec
// uses this so a passed-through copy of a semi-space flag can never override the pins we
// add and re-trigger the re-exec (V8 takes the LAST value).
export function stripSemiSpacePins(argv) {
    const out = [];
    for (let i = 0; i < argv.length; i++) {
        const raw = argv[i];
        const name = flagName(raw);
        if (name === 'min-semi-space-size' || name === 'max-semi-space-size') {
            // space-form value follows (`--max_semi_space_size 8`) -> drop it too.
            if (raw.indexOf('=') === -1 && argv[i + 1] !== undefined && /^[0-9]/.test(argv[i + 1])) i++;
            continue;
        }
        out.push(raw);
    }
    return out;
}

// The two semi-space pins that keep the one-box scale stable (torture requires these).
export function semiSpacePinned(m) {
    return m.get('min-semi-space-size') === '4' && m.get('max-semi-space-size') === '4';
}

// A measuring Kinds shard: pinned new-space AND single-tier compilation so a
// background recompile cannot flip a lane's boxing between runs.
export function pinnedSemiSpaceOk(m) {
    return semiSpacePinned(m) && m.get('concurrent-recompilation') === false;
}

// An ni- shard additionally requires inlining fully OFF: the EFFECTIVE (last) value
// of --max-inlined-bytecode-size must be 0, so a later non-zero override fails.
export function noinlineOk(m) {
    return m.get('max-inlined-bytecode-size') === '0';
}
