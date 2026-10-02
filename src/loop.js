// Round trips around the lake: ring of shore towns, optional bike legs, split into one or more days.
import { STOPS } from './data/network.js';
import { LAKESIDE } from './data/scenery.js';
import { LOOPS, SHORT_BIKE_KM, MAX_BIKE_KM_PER_DAY, NEXT_DAY_START } from './data/loops.js';
import { distanceKm, summarize } from './journey.js';
import { planSegment } from './planner.js';
import { parseHM } from './router.js';

const BIKE_KMH = 15;
const STAY_BY_DAYS = [30, 60, 90];
const LATE = 21 * 60 + 30;

const place = id => ({ ...STOPS[id], label: STOPS[id].name, demoId: id });
const bikeMinutes = km => Math.round(km / BIKE_KMH * 60);

export function buildLoop({ loop = 'obersee', start, direction = 'cw', bike = 'none', days = 1 }) {
  const ring = LOOPS[loop];
  let edges = ring.map(([id, km, cyclable], i) => ({ from: id, to: ring[(i + 1) % ring.length][0], km, cyclable }));
  if (direction === 'ccw') edges = edges.reverse().map(e => ({ ...e, from: e.to, to: e.from }));

  let entry = 0, entryKm = Infinity;
  edges.forEach((e, i) => {
    const km = distanceKm(STOPS[e.from], start);
    if (km < entryKm) { entry = i; entryKm = km; }
  });
  edges = [...edges.slice(entry), ...edges.slice(0, entry)];

  const stay = STAY_BY_DAYS[Math.min(days, 3) - 1];
  const segments = edges.map((e, i) => ({
    from: place(e.from), to: place(e.to), km: e.km,
    mode: bike !== 'none' && e.cyclable && (bike === 'most' || e.km <= SHORT_BIKE_KM) ? 'bike' : 'transit',
    stay: i < edges.length - 1 && STOPS[e.to].highlight ? stay : 0,
  }));
  // Starting away from the shore: travel to the nearest shore town first and back at the end.
  if (entryKm > 1.5) {
    const shore = segments[0].from;
    segments.unshift({ from: start, to: shore, km: entryKm, mode: 'transit', stay: 0, approach: true });
    segments.push({ from: shore, to: start, km: entryKm, mode: 'transit', stay: 0, approach: true });
  }
  return segments;
}

const estimate = s => s.stay + (s.mode === 'bike' ? bikeMinutes(s.km) : 20 + s.km * 1.5);

// Splits the ring into days of similar estimated duration; every day gets at least one segment.
export function splitDays(segments, days) {
  const est = segments.map(estimate);
  const total = est.reduce((a, b) => a + b, 0);
  const out = [];
  let current = [], acc = 0;
  segments.forEach((s, i) => {
    current.push(s);
    acc += est[i];
    const day = out.length + 1;
    const segmentsLeft = segments.length - i - 1;
    if (day < days && segmentsLeft >= days - day && acc >= (total * day) / days - est[i] / 2) {
      out.push(current);
      current = [];
    }
  });
  if (current.length) out.push(current);
  return out;
}

// Points along the shore between two towns, so cycling legs follow the lake on the map.
function shorePath(from, to) {
  const direct = distanceKm(from, to);
  const between = LAKESIDE.map(([lat, lon]) => ({ lat, lon }))
    .filter(p => distanceKm(from, p) + distanceKm(p, to) < direct * 1.15)
    .sort((a, b) => distanceKm(from, a) - distanceKm(from, b));
  return [from, ...between, to].map(p => [p.lat, p.lon]);
}

function bikeRoute(seg, t, ctx) {
  const arr = t + bikeMinutes(seg.km);
  const stop = (p, time) => ({ name: p.name, lat: p.lat, lon: p.lon, country: p.country, time });
  const leg = {
    kind: 'bike', line: null, from: stop(seg.from, t), to: stop(seg.to, arr),
    dep: t, arr, stops: [stop(seg.from, t), stop(seg.to, arr)], km: seg.km, geometry: shorePath(seg.from, seg.to),
  };
  return { ...summarize([leg], ctx, 'scenic'), source: 'bike' };
}

/**
 * opts: { loop, start (place), direction, bike: 'none'|'some'|'most', days }
 * q: journey query (date, startMin, party, stepFree). onProgress receives the partial result after each day.
 */
export async function planLoop(source, opts, q, signal, onProgress) {
  const chunks = splitDays(buildLoop(opts), opts.days);
  const persons = q.party.adults + q.party.kids;
  const party = opts.bike === 'none' ? q.party : { ...q.party, bikes: Math.max(q.party.bikes, persons) };
  const ctx = { party, bikeLegs: opts.bike !== 'none', stepFree: q.stepFree };
  // Known before planning, so the warning also explains a day that cannot be completed.
  const tooMuchBike = chunks.some(c => c.filter(s => s.mode === 'bike').reduce((km, s) => km + s.km, 0) > MAX_BIKE_KM_PER_DAY);
  const result = { days: [], bikeKm: 0, failedAt: null, tooMuchBike, late: false };

  for (const [d, chunk] of chunks.entries()) {
    const date = new Date(q.date);
    date.setDate(date.getDate() + d);
    let t = d === 0 ? q.startMin : parseHM(NEXT_DAY_START);
    const day = { date, segments: [], bikeKm: 0, overnight: d < chunks.length - 1 ? chunk.at(-1).to : null };
    result.days.push(day);

    for (const [i, seg] of chunk.entries()) {
      // No sightseeing stop at the overnight town: the evening is free anyway.
      const stay = i === chunk.length - 1 ? 0 : seg.stay;
      let route, fallback = false;
      const res = seg.mode === 'bike'
        ? { route: bikeRoute(seg, t, ctx), fallback: false }
        : await planSegment(source, { ...q, date, party, bikeLegs: false, from: seg.from, to: seg.to, startMin: t }, signal);
      if (!res || res.route.arr >= 24 * 60) {
        result.failedAt = { day: d, place: seg.to };
        onProgress?.(result);
        return result;
      }
      ({ route, fallback } = res);
      if (seg.mode === 'bike') day.bikeKm += seg.km;
      day.segments.push({ route, stay, at: seg.to, fallback, readyAt: t });
      t = route.arr + stay;
    }
    result.bikeKm += day.bikeKm;
    result.late ||= t > LATE;
    onProgress?.(result);
  }
  return result;
}
