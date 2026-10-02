// Chooses the data source and falls back to the demo network when real timetables fail or find nothing.
import { demo } from './providers/demo.js';
import { transitous } from './providers/transitous.js';

const isAbort = e => e?.name === 'AbortError';

export async function planJourney(source, q, signal, onPartial) {
  if (source !== 'live') return demo.plan(q);
  let fallback = 'empty';
  try {
    const result = await transitous.plan(q, signal, onPartial);
    if (result) return result;
  } catch (e) {
    if (isAbort(e)) throw e;
    console.warn(e);
    fallback = 'error';
  }
  const result = await demo.plan(q);
  return result && { ...result, fallback };
}

// One leg with real timetables, falling back to the demo network if that fails.
export async function planSegment(source, q, signal) {
  if (source === 'live') {
    try {
      const route = await transitous.segment(q, signal);
      if (route) return { route, fallback: false };
    } catch (e) {
      if (isAbort(e)) throw e;
      console.warn(e);
    }
  }
  const route = await demo.segment(q);
  return route ? { route, fallback: source === 'live' } : null;
}

// waypoints: [{ place, stay }]; each segment starts after the stay at the previous waypoint.
export async function planTourJourney(source, waypoints, q, signal) {
  const segments = [];
  let t = q.startMin;
  for (let i = 1; i < waypoints.length; i++) {
    const res = await planSegment(source, { ...q, from: waypoints[i - 1].place, to: waypoints[i].place, startMin: t }, signal);
    if (!res) return { segments, failedAt: waypoints[i].place };
    const stay = waypoints[i].stay ?? 0;
    segments.push({ route: res.route, stay, at: waypoints[i].place, fallback: res.fallback });
    t = res.route.arr + stay;
  }
  return { segments, failedAt: null };
}
