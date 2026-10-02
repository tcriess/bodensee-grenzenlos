import { test } from 'node:test';
import assert from 'node:assert/strict';
import * as network from '../src/data/network.js';
import { TOURS } from '../src/data/tours.js';
import { buildIndex, planRoute, planTour, parseHM } from '../src/router.js';

const index = buildIndex(network);
const summer = new Date('2026-07-10T00:00');
const winter = new Date('2026-01-15T00:00');
const party = (p = {}) => ({ adults: 1, kids: 0, dogs: 0, bikes: 0, ...p });
const route = (from, to, opts = {}) => planRoute(index, { from, to, date: summer, startMin: 9 * 60, party: party(), ...opts });
const usesMode = (r, mode) => r.legs.some(l => l.line?.mode === mode);

test('finds a cross-border connection with border crossing', () => {
  const r = route('zuerich', 'lindauInsel');
  assert.ok(r);
  assert.ok(r.countries.includes('CH') && r.countries.includes('DE'));
  assert.ok(r.crossings.length >= 1);
  assert.ok(r.notices.some(n => n.key === 'notice.customs'));
});

test('legs are chronological and respect transfer time', () => {
  const r = route('ulm', 'vaduz');
  for (let i = 1; i < r.legs.length; i++) assert.ok(r.legs[i].dep >= r.legs[i - 1].arr);
});

test('scenic is never faster, and at least as scenic as fast', () => {
  for (const [f, to] of [['schaffhausen', 'lindauInsel'], ['zuerich', 'bregenz'], ['singen', 'fnHafen']]) {
    const fast = route(f, to, { profile: 'fast' });
    const scenic = route(f, to, { profile: 'scenic' });
    assert.ok(scenic.arr >= fast.arr, `${f}->${to}`);
    assert.ok(scenic.scenic >= fast.scenic - 1e-9, `${f}->${to}`);
  }
});

test('scenic prefers the lake: Schaffhausen to Lindau uses a boat', () => {
  assert.ok(usesMode(route('schaffhausen', 'lindauInsel', { profile: 'scenic' }), 'ship'));
});

test('seasonal boats do not run in winter', () => {
  const r = route('konstanz', 'bregenz', { date: winter, profile: 'scenic' });
  assert.ok(r);
  assert.ok(!r.legs.some(l => l.line?.season));
});

test('bikes exclude lines without bike transport', () => {
  assert.ok(route('bregenz', 'pfaender'));
  assert.equal(route('bregenz', 'pfaender', { party: party({ bikes: 1 }) }), null);
});

test('bike legs are only used when everyone has a bike', () => {
  const withBikes = route('buchs', 'vaduz', { party: party({ bikes: 1 }), bikeLegs: true });
  assert.ok(withBikes.legs.some(l => l.kind === 'bike'));
  assert.equal(route('buchs', 'vaduz', { party: party({ adults: 2, bikes: 1 }), bikeLegs: true }), null);
});

test('dog crossing into Switzerland gets a pet passport notice', () => {
  const r = route('konstanz', 'stgallen', { party: party({ dogs: 1 }) });
  assert.ok(r.notices.some(n => n.key === 'notice.dogBorder'));
});

test('all curated tours are plannable on a summer day', () => {
  for (const tour of TOURS) {
    const plan = planTour(index, { waypoints: tour.waypoints, date: summer, startMin: parseHM(tour.start), party: party() });
    assert.equal(plan.failedAt, null, tour.id);
  }
});
