// Offline demo network with approximate timetables (src/data/network.js).
import * as network from '../data/network.js';
import { buildIndex, planRoute } from '../router.js';
import { distanceKm } from '../journey.js';

const index = buildIndex(network);

export function nearestDemoStop(place) {
  if (place.demoId) return place.demoId;
  let best = null, bestKm = 2.5;
  for (const [id, s] of Object.entries(network.STOPS)) {
    const km = distanceKm(s, place);
    if (km < bestKm) { best = id; bestKm = km; }
  }
  return best;
}

function query(q, profile) {
  const from = nearestDemoStop(q.from), to = nearestDemoStop(q.to);
  if (!from || !to) return null;
  return planRoute(index, { ...q, from, to, profile });
}

export const demo = {
  id: 'demo',
  async plan(q) {
    const fast = query(q, 'fast');
    return fast ? { fast, scenic: query(q, 'scenic') ?? fast } : null;
  },
  async segment(q) {
    return query(q, 'scenic');
  },
};
