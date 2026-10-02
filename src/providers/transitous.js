// Real timetables via the Transitous MOTIS API (open data, CORS-enabled).
// Usage policy: non-commercial, open-source, light use, visible link to https://transitous.org/sources/.
import { STOPS } from '../data/network.js';
import { SCENIC_HUBS } from '../data/scenery.js';
import { HUB_STOP_IDS } from '../data/hubs.js';
import { distanceKm, lakesideShare, scenicCost, summarize } from '../journey.js';

const API = 'https://api.transitous.org/api';
const REGION = { minLat: 46.8, maxLat: 48.6, minLon: 8.2, maxLon: 10.4 };
const TZ_COUNTRY = { 'Europe/Zurich': 'CH', 'Europe/Vaduz': 'LI', 'Europe/Vienna': 'AT', 'Europe/Berlin': 'DE', 'Europe/Busingen': 'DE' };

const MODES = {
  FERRY: 'ship', BUS: 'bus', COACH: 'bus',
  FUNICULAR: 'cablecar', AERIAL_LIFT: 'cablecar', AREAL_LIFT: 'cablecar', CABLE_CAR: 'cablecar',
};
const BASE_SCENIC = { train: 0.3, bus: 0.35, ship: 0.95, cablecar: 1 };
// Feeds carry no bike data in this region, so bike notices are derived from the transport mode.
const BIKES_BY_MODE = { ship: 'yes', bus: 'limited', cablecar: 'unknown' };
const RESERVATION_MODES = new Set(['LONG_DISTANCE', 'HIGHSPEED_RAIL', 'NIGHT_RAIL']);

const memo = new Map();

async function get(path, params, signal) {
  const qs = new URLSearchParams();
  for (const [k, v] of Object.entries(params)) if (v !== undefined && v !== null) qs.set(k, Array.isArray(v) ? v.join(',') : v);
  const url = `${API}${path}?${qs}`;
  if (memo.has(url)) return memo.get(url);
  // Own timeout so a hanging request falls back to the demo network instead of blocking the UI.
  const timeout = AbortSignal.timeout(12000);
  const res = await fetch(url, { signal: signal ? AbortSignal.any([signal, timeout]) : timeout });
  if (!res.ok) throw new Error(`Transitous ${res.status}`);
  const json = await res.json();
  memo.set(url, json);
  return json;
}

const inRegion = p => p.lat >= REGION.minLat && p.lat <= REGION.maxLat && p.lon >= REGION.minLon && p.lon <= REGION.maxLon;

// Rough outline of Liechtenstein: Swiss feeds label its stops with Europe/Zurich.
const LI_OUTLINE = [[47.272, 9.530], [47.240, 9.566], [47.229, 9.620], [47.150, 9.632], [47.058, 9.612],
  [47.050, 9.540], [47.090, 9.497], [47.150, 9.492], [47.200, 9.497], [47.240, 9.508]];

function inPolygon({ lat, lon }, poly) {
  let inside = false;
  for (let i = 0, j = poly.length - 1; i < poly.length; j = i++) {
    const [yi, xi] = poly[i], [yj, xj] = poly[j];
    if ((yi > lat) !== (yj > lat) && lon < ((xj - xi) * (lat - yi)) / (yj - yi) + xi) inside = !inside;
  }
  return inside;
}

function countryOf(stop) {
  if (stop.country) return stop.country;
  if (inPolygon(stop, LI_OUTLINE)) return 'LI';
  if (TZ_COUNTRY[stop.tz]) return TZ_COUNTRY[stop.tz];
  let best = null, bestKm = 3;
  for (const s of Object.values(STOPS)) {
    const km = distanceKm(s, stop);
    if (km < bestKm) { best = s; bestKm = km; }
  }
  return best?.country ?? null;
}

export async function searchStops(text, signal) {
  const results = await get('/v1/geocode', { text, type: 'STOP', numResults: 10, place: '47.6,9.4', placeBias: 3 }, signal);
  return results.filter(inRegion).map(r => {
    const city = r.areas?.find(a => a.default)?.name;
    return {
      name: r.name,
      label: city && !r.name.includes(city) ? `${r.name}, ${city}` : r.name,
      lat: r.lat, lon: r.lon, country: r.country ?? TZ_COUNTRY[r.tz], stopId: r.id,
    };
  });
}

// Google encoded polyline with configurable precision (MOTIS uses 6).
export function decodePolyline(str, precision = 6) {
  const factor = 10 ** precision, out = [];
  let lat = 0, lon = 0, i = 0;
  while (i < str.length) {
    for (const axis of [0, 1]) {
      let shift = 0, result = 0, b;
      do { b = str.charCodeAt(i++) - 63; result |= (b & 0x1f) << shift; shift += 5; } while (b >= 0x20);
      const d = result & 1 ? ~(result >> 1) : result >> 1;
      if (axis === 0) lat += d; else lon += d;
    }
    out.push([lat / factor, lon / factor]);
  }
  return out;
}

function normalizeItinerary(it, q) {
  const midnight = q.date.getTime();
  const minutes = iso => Math.round((Date.parse(iso) - midnight) / 60000);
  // MOTIS names coordinate endpoints START/END; show the user's chosen places instead.
  const named = s => (s.name === 'START' ? { ...s, name: q.from.name } : s.name === 'END' ? { ...s, name: q.to.name } : s);
  const stop = (s, iso) => ({ name: named(s).name, lat: s.lat, lon: s.lon, country: countryOf(s), time: minutes(iso) });
  const legs = [];
  for (const l of it.legs) {
    const dep = minutes(l.startTime), arr = minutes(l.endTime);
    const geometry = l.legGeometry?.points ? decodePolyline(l.legGeometry.points, l.legGeometry.precision ?? 6) : null;
    if (l.mode === 'WALK' || l.mode === 'BIKE') {
      // Platform changes and the last metres to a coordinate only clutter the list.
      if (l.mode === 'WALK' && (arr - dep < 2 || distanceKm(l.from, l.to) < 0.4)) continue;
      legs.push({
        kind: l.mode === 'BIKE' ? 'bike' : 'walk', line: null, from: stop(l.from, l.startTime), to: stop(l.to, l.endTime),
        dep, arr, stops: [stop(l.from, l.startTime), stop(l.to, l.endTime)], geometry,
        km: l.distance ? Math.round(l.distance / 100) / 10 : undefined,
      });
      continue;
    }
    const mode = MODES[l.mode] ?? 'train';
    const stops = [
      stop(l.from, l.startTime),
      ...(l.intermediateStops ?? []).map(s => stop(s, s.departure ?? s.arrival)),
      stop(l.to, l.endTime),
    ];
    const base = BASE_SCENIC[mode];
    const scenic = mode === 'ship' || mode === 'cablecar' ? base : base + (0.75 - base) * lakesideShare(stops);
    const label = l.routeShortName || l.displayName || l.tripShortName || mode;
    legs.push({
      kind: 'ride',
      line: {
        id: l.routeId, label, mode, scenic,
        name: l.routeLongName && l.routeLongName !== label && l.routeLongName.length <= 40 ? l.routeLongName : null,
        operator: l.agencyName ?? '',
        bikes: RESERVATION_MODES.has(l.mode) ? 'reservation' : BIKES_BY_MODE[mode] ?? 'yes',
      },
      headsign: l.headsign || l.tripTo?.name || null,
      from: stops[0], to: stops.at(-1), dep, arr, stops, geometry,
      delay: l.from.scheduledDeparture ? minutes(l.from.departure) - minutes(l.from.scheduledDeparture) : 0,
      realtime: Boolean(l.realTime), cancelled: Boolean(l.cancelled),
    });
  }
  return legs;
}

const placeParam = p => p.stopId ?? `${p.lat},${p.lon}`;

function baseParams(q) {
  const time = new Date(q.date.getTime() + q.startMin * 60000).toISOString();
  const params = { fromPlace: placeParam(q.from), toPlace: placeParam(q.to), time, numItineraries: 5 };
  if (q.stepFree) params.pedestrianProfile = 'WHEELCHAIR';
  if (q.bikeLegs) {
    Object.assign(params, {
      preTransitModes: ['WALK', 'BIKE'], postTransitModes: ['WALK', 'BIKE'], directModes: ['WALK', 'BIKE'],
      cyclingSpeed: 4.2, maxPreTransitTime: 1800, maxPostTransitTime: 1800, maxDirectTime: 3600,
    });
  }
  return params;
}

export function selectRoutes(responses, q) {
  return choose(toRoutes(responses, q), q);
}

function toRoutes(responses, q) {
  const seen = new Set(), routes = [];
  for (const res of responses) {
    for (const it of res?.itineraries ?? []) {
      const key = `${it.startTime}|${it.endTime}|${it.legs.map(l => l.tripId ?? l.mode).join(',')}`;
      if (seen.has(key)) continue;
      seen.add(key);
      const legs = normalizeItinerary(it, q);
      if (!legs.length || legs.some(l => l.cancelled)) continue;
      routes.push(legs);
    }
  }
  const penalty = legs => q.party.bikes > 0 ? legs.filter(l => l.line && (l.line.mode === 'bus' || l.line.mode === 'cablecar')).length * 30 : 0;
  return routes.map(legs => ({ legs, penalty: penalty(legs) }));
}

function choose(candidates, q) {
  if (!candidates.length) return null;
  const ctx = { party: q.party, bikeLegs: q.bikeLegs, stepFree: q.stepFree };
  const all = candidates.map(c => ({ ...summarize(c.legs, ctx, 'fast'), penalty: c.penalty, source: 'live' }));
  // Earliest arrival (with transfer and bike penalties); on a tie the later departure wins.
  const fastKey = r => r.arr + 5 * r.transfers + r.penalty - r.dep / 1000;
  const fast = all.reduce((a, b) => (fastKey(b) < fastKey(a) ? b : a));
  const maxDuration = Math.max(fast.duration + 90, 2 * fast.duration);
  const scenic = all
    .filter(r => r.duration <= maxDuration && r.dep <= q.startMin + 150)
    .reduce((a, b) => (scenicCost(b, q.startMin) + b.penalty < scenicCost(a, q.startMin) + a.penalty ? b : a), fast);
  return { fast, scenic: { ...scenic, profile: 'scenic' } };
}

// The best-placed pier on the way; via searches are expensive for the server, so only one is used.
function hubOnTheWay(from, to) {
  const direct = distanceKm(from, to);
  return SCENIC_HUBS
    .filter(h => HUB_STOP_IDS[h.name] && distanceKm(h, from) > 3 && distanceKm(h, to) > 3)
    .map(h => ({ id: HUB_STOP_IDS[h.name], ratio: (distanceKm(from, h) + distanceKm(h, to)) / direct }))
    .filter(x => x.ratio < 1.4)
    .sort((a, b) => a.ratio - b.ratio)[0]?.id ?? null;
}

const usesShip = route => route.legs.some(l => l.line?.mode === 'ship');

export const transitous = {
  id: 'live',

  // onPartial receives a first result while the optional scenic via-search is still running.
  async plan(q, signal, onPartial) {
    const base = baseParams(q);
    const [narrow, wide] = await Promise.allSettled([
      get('/v5/plan', { ...base, searchWindow: 1800 }, signal),
      get('/v5/plan', { ...base, searchWindow: 5400, numItineraries: 8 }, signal),
    ]);
    if (narrow.status === 'rejected') throw narrow.reason;
    const responses = [narrow, wide].filter(s => s.status === 'fulfilled').map(s => s.value);
    const first = choose(toRoutes(responses, q), q);
    const hub = q.profile === 'scenic' && first && !usesShip(first.scenic) ? hubOnTheWay(q.from, q.to) : null;
    if (!hub) return first;

    onPartial?.({ ...first, pending: true });
    try {
      responses.push(await get('/v5/plan', { ...base, searchWindow: 3600, via: hub, viaMinimumStay: 0, timeout: 5 }, signal));
    } catch (e) {
      if (e.name === 'AbortError') throw e;
    }
    return choose(toRoutes(responses, q), q);
  },

  // Single request per tour segment; picks the most scenic of the returned options.
  async segment(q, signal) {
    const res = await get('/v5/plan', { ...baseParams(q), searchWindow: 3600, numItineraries: 6 }, signal);
    return choose(toRoutes([res], q), q)?.scenic ?? null;
  },
};
