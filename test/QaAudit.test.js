/**
 * @zakkster/lite-logn -- cross-cutting QA audit.
 *
 * The suite-law regression guard, independent of any member. At v0.1.0 (the
 * scaffold) it enforces the invariants that must hold before ANY member ships:
 *   - the VERSION trinity (LogN.js const === package.json === llms.txt);
 *   - the frozen export surface (VERSION only, no member yet);
 *   - the six-file pack discipline (files[] exact; repo-only dirs absent);
 *   - no "Karadjov" anywhere in the shipped source / docs;
 *   - ASCII-only source in LogN.js (U+00D7 and U+00B5 the sole exceptions).
 * Each member session appends its coercion / boundary block below.
 */

import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import * as LogNModule from '../LogN.js';
import { VERSION } from '../LogN.js';

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = join(__dirname, '..');

// --- VERSION trinity: LogN.js const === package.json === llms.txt -----------

test('VERSION trinity: LogN.js const, package.json, and llms.txt agree byte-for-byte', () => {
    const pkg = JSON.parse(readFileSync(join(ROOT, 'package.json'), 'utf8'));
    assert.equal(VERSION, pkg.version, 'LogN.js VERSION const !== package.json version');
    const llms = readFileSync(join(ROOT, 'llms.txt'), 'utf8');
    const m = llms.match(/^Version:\s*(\S+)/m);
    assert.ok(m, 'llms.txt must carry a "Version: <x>" header line');
    assert.equal(m[1], VERSION, 'llms.txt Version header !== LogN.js VERSION const');
});

test('VERSION is exactly 0.1.0 at the scaffold release', () => {
    assert.equal(VERSION, '0.1.0');
});

// --- frozen export surface: VERSION only (no member yet) --------------------

test('LogN.js exports exactly VERSION at v0.1.0 -- no member has leaked in', () => {
    const exportedNames = Object.keys(LogNModule).sort();
    assert.deepEqual(exportedNames, ['VERSION'],
        'LogN.js export surface drifted from the frozen scaffold surface (VERSION only)');
    assert.equal(typeof VERSION, 'string');
});

// --- six-file pack discipline (D-07 / decisions/0003) -----------------------

test('package.json files[] ships exactly the six shipped files', () => {
    const pkg = JSON.parse(readFileSync(join(ROOT, 'package.json'), 'utf8'));
    const expected = ['LogN.js', 'LogN.d.ts', 'llms.txt', 'README.md', 'CHANGELOG.md', 'LICENSE'];
    assert.deepEqual([...pkg.files].sort(), [...expected].sort(),
        'files[] drifted from the six shipped files');
});

test('files[] contains none of the repo-only paths', () => {
    const pkg = JSON.parse(readFileSync(join(ROOT, 'package.json'), 'utf8'));
    const repoOnly = ['test', 'benchmark', 'decisions', 'demo', 'ROADMAP.md', 'RESEARCH.md', 'GUIDE.md'];
    for (const f of pkg.files) {
        for (const banned of repoOnly) {
            assert.ok(!f.startsWith(banned),
                'files[] must not ship the repo-only path ' + f);
        }
    }
});

// --- no "Karadjov" anywhere in the shipped source / docs --------------------

test('no "Karadjov" in the shipped files (the name is always Shinikchiev)', () => {
    const files = ['LogN.js', 'LogN.d.ts', 'llms.txt', 'README.md', 'CHANGELOG.md', 'LICENSE', 'package.json'];
    for (const f of files) {
        const text = readFileSync(join(ROOT, f), 'utf8');
        assert.ok(!/Karadjov/i.test(text), f + ' must not contain "Karadjov"');
    }
    // the copyright holder is spelled correctly where attribution lives
    const license = readFileSync(join(ROOT, 'LICENSE'), 'utf8');
    assert.ok(/Zahary Shinikchiev/.test(license), 'LICENSE must credit Zahary Shinikchiev');
    const pkg = JSON.parse(readFileSync(join(ROOT, 'package.json'), 'utf8'));
    assert.ok(/Zahary Shinikchiev/.test(pkg.author), 'package.json author must be Zahary Shinikchiev');
});

// --- ASCII-only source in LogN.js (U+00D7 x, U+00B5 mu excepted) -------------

test('LogN.js is ASCII-only (U+00D7 and U+00B5 the sole permitted exceptions)', () => {
    const src = readFileSync(join(ROOT, 'LogN.js'), 'utf8');
    let bad = 0;
    for (let i = 0; i < src.length; i++) {
        const c = src.charCodeAt(i);
        if (c > 0x7f && c !== 0x00d7 && c !== 0x00b5) {
            bad++;
        }
    }
    assert.equal(bad, 0, 'LogN.js contains ' + bad + ' non-ASCII code unit(s) outside x / mu');
});

// --- member coercion / boundary blocks land below (one per member) ----------
