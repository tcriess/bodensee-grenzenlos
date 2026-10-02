import { test } from 'node:test';
import assert from 'node:assert/strict';
import { STOPS } from '../src/data/network.js';
import { buildLoop, splitDays, planLoop } from '../src/loop.js';

const place = id => ({ ...STOPS[id], label: STOPS[id].name, demoId: id });
const q = { date: new Date('2026-07-10T00:00'), startMin: 9 * 60, party: { adults: 2, kids: 0, dogs: 0, bikes: 0 }, stepFree: false };

test('loop starts at the nearest shore town and closes the ring', () => {
  const segs = buildLoop({ loop: 'obersee', start: place('arbon') });
  assert.equal(segs[0].from.demoId, 'arbon');
  assert.equal(segs.at(-1).to.demoId, 'arbon');
  for (let i = 1; i < segs.length; i++) assert.equal(segs[i].from.demoId, segs[i - 1].to.demoId);
});

test('counter-clockwise reverses the order', () => {
  const cw = buildLoop({ loop: 'obersee', start: place('konstanz') });
  const ccw = buildLoop({ loop: 'obersee', start: place('konstanz'), direction: 'ccw' });
  assert.equal(cw[0].to.demoId, 'meersburg');
  assert.equal(ccw[0].to.demoId, 'kreuzlingen');
});

test('a start away from the shore adds approach and return', () => {
  const segs = buildLoop({ loop: 'obersee', start: place('stgallen') });
  assert.ok(segs[0].approach && segs.at(-1).approach);
  assert.equal(segs[0].from.demoId, 'stgallen');
});

test('bike modes choose cyclable segments', () => {
  const some = buildLoop({ loop: 'obersee', start: place('konstanz'), bike: 'some' });
  const most = buildLoop({ loop: 'obersee', start: place('konstanz'), bike: 'most' });
  assert.equal(some.find(s => s.to.demoId === 'meersburg').mode, 'transit'); // ferry
  assert.ok(most.filter(s => s.mode === 'bike').length > some.filter(s => s.mode === 'bike').length);
});

test('days split into contiguous, non-empty chunks', () => {
  const segs = buildLoop({ loop: 'full', start: place('konstanz'), days: 3 });
  const days = splitDays(segs, 3);
  assert.equal(days.length, 3);
  assert.deepEqual(days.flat(), segs);
});

test('plans the Obersee loop in one day with the demo network', async () => {
  const res = await planLoop('demo', { loop: 'obersee', start: place('konstanz'), direction: 'cw', bike: 'none', days: 1 }, q);
  assert.equal(res.failedAt, null);
  const countries = new Set(res.days.flatMap(d => d.segments.flatMap(s => s.route.countries)));
  assert.deepEqual([...countries].sort(), ['AT', 'CH', 'DE']);
});

test('plans the full loop mostly by bike over three days', async () => {
  const res = await planLoop('demo', { loop: 'full', start: place('konstanz'), direction: 'cw', bike: 'most', days: 3 }, q);
  assert.equal(res.failedAt, null);
  assert.equal(res.days.length, 3);
  assert.ok(res.bikeKm > 150);
  assert.ok(res.days[0].overnight && !res.days[2].overnight);
});

test('flags too much cycling for a single day', async () => {
  const res = await planLoop('demo', { loop: 'full', start: place('konstanz'), direction: 'cw', bike: 'most', days: 1 }, q);
  assert.ok(res.tooMuchBike);
});
