import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { decodePolyline, selectRoutes } from '../src/providers/transitous.js';

// Recorded response for Zürich HB -> Lindau-Insel on 2026-10-03 from 10:00 local time.
const fixture = JSON.parse(await readFile(new URL('./fixtures/plan-zuerich-lindau.json', import.meta.url)));
const q = {
  from: { name: 'Zürich HB', lat: 47.3779, lon: 8.5403 }, to: { name: 'Lindau-Insel', lat: 47.5454, lon: 9.6808 },
  date: new Date('2026-10-03T00:00:00+02:00'), startMin: 600, profile: 'fast',
  party: { adults: 1, kids: 0, dogs: 1, bikes: 0 }, bikeLegs: false, stepFree: false,
};

test('decodes polylines with precision 6', () => {
  assert.deepEqual(decodePolyline('_izlhA~rlgdF', 6), [[38.5, -120.2]]);
});

test('normalises itineraries into journeys with local times and countries', () => {
  const { fast, scenic } = selectRoutes([fixture], q);
  assert.ok(fast.dep >= 600 && fast.arr > fast.dep);
  assert.deepEqual(fast.countries.filter(c => c !== 'AT'), ['CH', 'DE']);
  assert.ok(fast.crossings.length >= 1);
  assert.ok(fast.notices.some(n => n.key === 'notice.dogBorder'));
  assert.ok(scenic.scenic >= fast.scenic - 1e-9);
  for (const leg of fast.legs) {
    assert.ok(leg.stops.every(s => s.name && Number.isFinite(s.lat)));
    if (leg.kind === 'ride') assert.ok(leg.geometry.length > 1);
  }
});

test('drops short platform walks', () => {
  const { fast } = selectRoutes([fixture], q);
  assert.ok(fast.legs.every(l => l.kind !== 'walk' || l.arr - l.dep >= 2));
});
