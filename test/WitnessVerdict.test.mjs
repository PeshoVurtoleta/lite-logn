/**
 * @zakkster/lite-logn -- W1 witness-verdict unit test (FAST; no real sweeps).
 *
 * W1 (decisions/0004): a lane that misses ONLY the R^2 floor (slope INSIDE its band,
 * foil OFF) is re-measured ONCE; a slope-band miss or a foil failure is NEVER retried.
 * The decision logic is factored into the pure `witnessVerdict(fit, foil, band, floor,
 * retryFit)` so it can be proven here WITHOUT running the ~30s witness sweep -- this file
 * imports the function only (the witness main() is entry-point-guarded, so no sweep runs).
 */

import test from 'node:test';
import assert from 'node:assert/strict';
import { witnessVerdict } from './witness.mjs';

const FLOOR = 0.958;
const BAND = { lo: 5, hi: 10 };               // slope band
const FOIL_OFF = { r2: 0.80 };                // an O(n) foil that leaves the line (good)
const FOIL_ON = { r2: 0.99 };                 // a foil that did NOT leave (a real failure)

test('W1: a clean lane passes with no retry', () => {
    const fit = { r2: 0.99, slope: 7 };
    const v = witnessVerdict(fit, FOIL_OFF, BAND, FLOOR, null);
    assert.equal(v.ok, true);
    assert.equal(v.onLine, true);
    assert.equal(v.retryEligible, false);
    assert.equal(v.retried, false);
});

test('W1: an injected R^2-only miss PASSES on the retry (slope in band, foil off)', () => {
    const fit = { r2: 0.950, slope: 7 };      // below floor, but slope in band, foil off
    const first = witnessVerdict(fit, FOIL_OFF, BAND, FLOOR, null);
    assert.equal(first.retryEligible, true, 'a lone R^2 miss earns the retry');
    assert.equal(first.ok, false, 'without the retry it is OFF-LINE');
    const retryFit = { r2: 0.970, slope: 7 };  // the single re-measure clears the floor
    const v = witnessVerdict(fit, FOIL_OFF, BAND, FLOOR, retryFit);
    assert.equal(v.retried, true);
    assert.equal(v.r2Ok, true);
    assert.equal(v.ok, true, 'the retry rescues a quiescent-run R^2 flake');
});

test('W1: a SECOND R^2 miss FAILS (the retry also misses the floor)', () => {
    const fit = { r2: 0.950, slope: 7 };
    const retryFit = { r2: 0.955, slope: 7 };  // still below the floor
    const v = witnessVerdict(fit, FOIL_OFF, BAND, FLOOR, retryFit);
    assert.equal(v.retryEligible, true);
    assert.equal(v.retried, true);
    assert.equal(v.ok, false, 'two R^2 misses in a row is a genuine failure');
});

test('W1: a slope-band miss FAILS WITHOUT a retry (even if a retryFit is supplied)', () => {
    const fit = { r2: 0.99, slope: 2 };        // R^2 fine, slope BELOW the band
    const v0 = witnessVerdict(fit, FOIL_OFF, BAND, FLOOR, null);
    assert.equal(v0.retryEligible, false, 'a slope-band miss is never retried');
    assert.equal(v0.ok, false);
    // supplying a retryFit must NOT rescue a slope-band miss (slope is judged on the original).
    const v1 = witnessVerdict(fit, FOIL_OFF, BAND, FLOOR, { r2: 0.99, slope: 7 });
    assert.equal(v1.retried, false);
    assert.equal(v1.ok, false);
});

test('W1: a foil failure is NEVER retried (foil ON-LINE blocks the retry)', () => {
    const fit = { r2: 0.950, slope: 7 };       // R^2 miss, slope in band...
    const v = witnessVerdict(fit, FOIL_ON, BAND, FLOOR, { r2: 0.99, slope: 7 });
    assert.equal(v.retryEligible, false, 'the foil did not leave -- no retry');
    assert.equal(v.foilOff, false);
    assert.equal(v.retried, false);
    assert.equal(v.ok, false);
});

test('W1: slope at the exact band edges is IN band (inclusive)', () => {
    for (const slope of [BAND.lo, BAND.hi]) {
        const v = witnessVerdict({ r2: 0.99, slope }, FOIL_OFF, BAND, FLOOR, null);
        assert.equal(v.slopeIn, true, 'slope ' + slope + ' is inclusive');
        assert.equal(v.ok, true);
    }
});
