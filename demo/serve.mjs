// @zakkster/lite-logn -- demo trace/witness server (repo-only dev artifact, NEVER shipped).
//
//   npm run demo:serve            (then open http://localhost:8018/)
//   node demo/serve.mjs [port]
//
// A zero-dependency Node http server (node:http + node:fs only). Its web root is the
// LiteLogN REPO ROOT, so the page at /demo/visuals.html and its ../LogN.js +
// ./Visualize.mjs + ./renderers.mjs imports all resolve from one origin.
//
// Two dynamic routes, both computed SERVER-SIDE (browser timing is untrustworthy
// for a foil comparison -- call #5):
//
//   GET /witness.json?member=Fenwick&op=update   (member+op optional -> all rows)
//     -> { rows:[{ name, op, r2, slope, foilR2, foilSlope, foilName, points, ...}] }
//     The fits are computed off the SHIPPED witness registry (../test/witness.mjs
//     MEMBERS + fitLogLinear) -- the same kernels/sweeps/bands the gate uses, NOT a
//     demo re-implementation. Results are cached per op-row (the kernels are slow).
//
//   GET /stream.json?seed=1&n=31&workload=mixed&steps=200
//     -> { index, workload, n, digest }   the seeded op-stream run server-side; the
//     browser runs the SAME LCG stream and compares digests (determinism cross-check).
//
// Every bad route/param fails CLOSED (400/403/404 + a JSON {error} for the dynamic
// routes), never a throw that escapes the handler. Throw prefix: [lite-logn-demo].
//
// Zero runtime deps ship: this file is a dev artifact, never in the tarball.

import http from 'node:http';
import { readFile } from 'node:fs/promises';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { dirname, join, normalize, sep, extname } from 'node:path';

import { SkipList } from '../LogN.js';
import { MEMBERS, fitLogLinear } from '../test/witness.mjs';
import { createEngine, runSteps, digestEngine, THROW, WORKLOADS } from './Visualize.mjs';

const DEMO_DIR = dirname(fileURLToPath(import.meta.url));
const ROOT = dirname(DEMO_DIR); // repo root -- so ../LogN.js from /demo resolves to /LogN.js

/** The default port. Overridable via `node demo/serve.mjs [port]`. */
export const DEFAULT_PORT = 8018;

const MIME = {
    '.html': 'text/html; charset=utf-8',
    '.mjs': 'text/javascript; charset=utf-8',
    '.js': 'text/javascript; charset=utf-8',
    '.css': 'text/css; charset=utf-8',
    '.json': 'application/json; charset=utf-8',
    '.map': 'application/json; charset=utf-8',
    '.svg': 'image/svg+xml',
};

/** Valid "member.op" keys, straight from the SHIPPED witness registry. */
const OP_ROWS = MEMBERS.map((m) => m.name + '.' + m.op);
const ROW_INDEX = {};
for (let i = 0; i < MEMBERS.length; i++) ROW_INDEX[MEMBERS[i].name + '.' + MEMBERS[i].op] = i;

/** Per-op-row cache: the kernels are slow, so a computed row is memoized. */
const ROW_CACHE = {};

/**
 * Compute one witness op-row off the SHIPPED registry entry (its run/foil kernels,
 * sweep, foilSweep, per-op slope band + the shared R^2 floor) with the SHIPPED
 * fitLogLinear. Never re-implements the fit or the foil. Cached by "member.op".
 *
 * @param {string} key  "Member.op" (must be an OP_ROWS entry)
 */
export function computeWitnessRow(key) {
    if (ROW_INDEX[key] === undefined) {
        throw new RangeError(THROW + ' unknown witness op-row ' + String(key) +
            ' (one of ' + OP_ROWS.join(', ') + ')');
    }
    if (ROW_CACHE[key]) return ROW_CACHE[key];
    const m = MEMBERS[ROW_INDEX[key]];
    const xs = [], ys = [], points = [];
    for (const n of m.sweep) {
        const x = Math.log2(n), ns = m.run(n);
        xs.push(x); ys.push(ns); points.push({ n, x, ns });
    }
    const fit = fitLogLinear(xs, ys);
    const fxs = [], fys = [], foilPoints = [];
    for (const n of m.foilSweep) {
        const x = Math.log2(n), ns = m.foil(n);
        fxs.push(x); fys.push(ns); foilPoints.push({ n, x, ns });
    }
    const ffit = fitLogLinear(fxs, fys);
    const onLine = fit.r2 >= m.r2Floor && fit.slope >= m.slopeLo && fit.slope <= m.slopeHi;
    const foilOff = ffit.r2 < m.r2Floor;
    const row = {
        name: m.name, op: m.op,
        r2: fit.r2, slope: fit.slope, intercept: fit.intercept,
        foilR2: ffit.r2, foilSlope: ffit.slope, foilName: m.foilName,
        r2Floor: m.r2Floor, slopeLo: m.slopeLo, slopeHi: m.slopeHi,
        onLine, foilOff,
        points, foilPoints,
    };
    // SkipList.set is EXPECTED (not worst-case) O(log n): disclose the MAX single
    // insert, timed SERVER-SIDE on the SHIPPED SkipList over a random build trace.
    if (key === 'SkipList.set') row.maxInsertNs = sampleMaxInsert(4096, 0xC0DE);
    ROW_CACHE[key] = row;
    return row;
}

/** Time every individual insert building a fresh SkipList from n keys in random
 *  order (the shipped member, server-side), returning the worst single insert (ns)
 *  -- the unlucky-tower tail an EXPECTED-O(log n) member must disclose. */
function sampleMaxInsert(n, seed) {
    const keys = new Float64Array(n);
    for (let i = 0; i < n; i++) keys[i] = i;
    let r = seed | 0;
    for (let i = n - 1; i > 0; i--) {
        r = (Math.imul(r, 1664525) + 1013904223) | 0;
        const j = (r >>> 0) % (i + 1);
        const t = keys[i]; keys[i] = keys[j]; keys[j] = t;
    }
    const sl = new SkipList(n, (seed >>> 0) || 1);
    let max = 0;
    for (let i = 0; i < n; i++) {
        const t0 = Number(process.hrtime.bigint());
        sl.set(keys[i], i);
        const e = Number(process.hrtime.bigint()) - t0;
        if (e > max) max = e;
    }
    return max;
}

/** Compute the requested witness rows (one op-row, or all). Pure; used by handle(). */
export function serveWitness(member, op) {
    if (member === null && op === null) {
        return { rows: OP_ROWS.map((k) => computeWitnessRow(k)) };
    }
    if (member === null || op === null) {
        throw new RangeError(THROW + ' /witness.json needs BOTH member and op, or neither');
    }
    return { rows: [computeWitnessRow(member + '.' + op)] };
}

/** Run the seeded op-stream server-side and return its digest (the browser runs the
 *  same LCG stream and compares). Fails closed on bad params. */
export function serveStream(seed, n, workload, steps) {
    // A present-but-invalid seed (e.g. ?seed=foo -> NaN) fails CLOSED like n / steps /
    // workload -- it is NOT silently coerced ("null is not zero"). seed 0 is a legal
    // value the engine normalizes to a non-zero LCG state; a non-integer is rejected.
    if (!Number.isInteger(seed) || seed < 0 || seed > 0xFFFFFFFF) {
        throw new RangeError(THROW + ' /stream.json seed must be an unsigned 32-bit integer, got ' + String(seed));
    }
    if (!Number.isInteger(steps) || steps < 0 || steps > 5000000) {
        throw new RangeError(THROW + ' /stream.json steps must be an integer in [0, 5e6], got ' + String(steps));
    }
    if (WORKLOADS.indexOf(workload) === -1) {
        throw new RangeError(THROW + ' /stream.json workload must be one of ' + WORKLOADS.join('|'));
    }
    const engine = createEngine({ seed, n, workload });
    runSteps(engine, steps);
    return { index: engine.index, workload, n: engine.n, seed: engine.seed, digest: digestEngine(engine) };
}

/** Resolve a URL path to a real file under ROOT, or null if malformed / escaping. */
export function safePath(urlPath) {
    let decoded;
    try {
        decoded = decodeURIComponent(urlPath);
    } catch {
        return null; // malformed percent-encoding -> fail closed
    }
    const rel = normalize(decoded).replace(/^(\.\.[/\\])+/, '');
    const abs = join(ROOT, rel);
    if (abs !== ROOT && !abs.startsWith(ROOT + sep)) return null; // path traversal guard
    return abs;
}

function sendJson(res, code, obj) {
    res.writeHead(code, { 'content-type': MIME['.json'], 'cache-control': 'no-store' });
    res.end(JSON.stringify(obj));
}

/** The one-line request handler. Exported so a test can drive it without a socket. */
export async function handle(req, res) {
    const url = new URL(req.url, 'http://localhost');

    if (url.pathname === '/witness.json') {
        try {
            const member = url.searchParams.get('member');
            const op = url.searchParams.get('op');
            sendJson(res, 200, serveWitness(member, op));
        } catch (err) {
            sendJson(res, 400, { error: String((err && err.message) || err) });
        }
        return;
    }

    if (url.pathname === '/stream.json') {
        try {
            const seedParam = url.searchParams.get('seed');
            const nParam = url.searchParams.get('n');
            const stepsParam = url.searchParams.get('steps');
            const workload = url.searchParams.get('workload') || 'mixed';
            // "null is not zero": only a genuinely ABSENT param uses the default; a
            // present-but-invalid value is passed through to serveStream, which rejects it.
            const seed = seedParam === null ? 0x9E3779B9 : Number(seedParam);
            const n = nParam === null ? 31 : Number(nParam);
            const steps = stepsParam === null ? 200 : Number(stepsParam);
            sendJson(res, 200, serveStream(seed, n, workload, steps));
        } catch (err) {
            sendJson(res, 400, { error: String((err && err.message) || err) });
        }
        return;
    }

    // "/" -> 302 REDIRECT to the page's real path (NOT an in-place serve). Serving the
    // HTML at "/" leaves the document base URL at "/", so the page's relative imports
    // (./Visualize.mjs, ./renderers.mjs) resolve to the repo root and 404. Redirecting
    // makes the browser re-request /demo/visuals.html, so the base URL becomes /demo/.
    if (url.pathname === '/') {
        res.writeHead(302, { location: '/demo/visuals.html' });
        res.end();
        return;
    }

    // Static files. A malformed path, a traversal escape, or a missing file all fail
    // CLOSED with a 403/404 -- never a throw that escapes the handler.
    const pathname = url.pathname;
    try {
        const abs = safePath(pathname);
        if (abs === null) { res.writeHead(403); res.end('forbidden'); return; }
        const data = await readFile(abs);
        const type = MIME[extname(abs)] || 'application/octet-stream';
        res.writeHead(200, { 'content-type': type });
        res.end(data);
        return;
    } catch {
        // fall through to the 404 below (missing file / read error)
    }
    res.writeHead(404, { 'content-type': 'text/plain; charset=utf-8' });
    res.end('404 ' + pathname);
}

/** Create (but do not start) the http server. A rejection from any unforeseen path
 *  is caught and turned into a 500, never an unhandled rejection that crashes. */
export function createServer() {
    return http.createServer((req, res) => {
        handle(req, res).catch((err) => {
            try {
                if (!res.headersSent) res.writeHead(500, { 'content-type': 'text/plain; charset=utf-8' });
                res.end('500 ' + String((err && err.message) || err));
            } catch {
                /* the response is already gone -- nothing more to do */
            }
        });
    });
}

/** Start listening. Returns the server. */
export function start(port) {
    const server = createServer();
    server.listen(port, () => {
        process.stdout.write('lite-logn demo server on http://localhost:' + port + '/\n');
        process.stdout.write('  page:     http://localhost:' + port + '/\n');
        process.stdout.write('  witness:  http://localhost:' + port + '/witness.json?member=Fenwick&op=update\n');
        process.stdout.write('  stream:   http://localhost:' + port + '/stream.json?seed=1&n=31&workload=mixed&steps=200\n');
    });
    return server;
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
    start(Number(process.argv[2]) || DEFAULT_PORT);
}
