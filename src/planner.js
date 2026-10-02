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

// waypoints: [{ place, stay }]; each segment starts after the stay at the previous waypoint.
export async function planTourJourney(source, waypoints, q, signal) {
  const segments = [];
  let t = q.startMin;
  for (let i = 1; i < waypoints.length; i++) {
    const segQ = { ...q, from: waypoints[i - 1].place, to: waypoints[i].place, startMin: t };
    let route = null;
    if (source === 'live') {
      try { route = await transitous.segment(segQ, signal); } catch (e) { if (isAbort(e)) throw e; console.warn(e); }
    }
    const fallback = !route && source === 'live';
    route ??= await demo.segment(segQ);
    if (!route) return { segments, failedAt: waypoints[i].place };
    const stay = waypoints[i].stay ?? 0;
    segments.push({ route, stay, at: waypoints[i].place, fallback });
    t = route.arr + stay;
  }
  return { segments, failedAt: null };
}
