// Provider-independent journey model: summary, border crossings, scenic score and travel notices.
import { STOPS } from './data/network.js';
import { LAKESIDE } from './data/scenery.js';

const HIGHLIGHTS = Object.values(STOPS).filter(s => s.highlight);
const SCENIC_BY_KIND = { walk: 0.5, bike: 0.8 };

export function distanceKm(a, b) {
  const rad = Math.PI / 180;
  const dLat = (b.lat - a.lat) * rad, dLon = (b.lon - a.lon) * rad;
  const h = Math.sin(dLat / 2) ** 2 + Math.cos(a.lat * rad) * Math.cos(b.lat * rad) * Math.sin(dLon / 2) ** 2;
  return 12742 * Math.asin(Math.sqrt(h));
}

export const lakesideShare = stops =>
  stops.length ? stops.filter(s => LAKESIDE.some(([lat, lon]) => distanceKm(s, { lat, lon }) < 1.5)).length / stops.length : 0;

const legScenic = leg => leg.line ? leg.line.scenic : SCENIC_BY_KIND[leg.kind] ?? 0.5;

/**
 * legs: [{ kind: 'ride'|'walk'|'bike', line?: {label, name, operator, mode, scenic, bikes, season},
 *          from, to, dep, arr, stops: [{name, country, lat, lon, time}], geometry?, km? }]
 * dep/arr/time are minutes since local midnight of the travel date.
 */
export function summarize(legs, ctx, profile) {
  for (const leg of legs) {
    leg.crossings = [];
    for (let i = 1; i < leg.stops.length; i++) {
      const a = leg.stops[i - 1].country, b = leg.stops[i].country;
      if (a && b && a !== b) leg.crossings.push({ from: a, to: b });
    }
  }
  const allStops = legs.flatMap(l => l.stops);
  let weighted = 0, moving = 0;
  for (const l of legs) {
    const min = l.arr - l.dep;
    weighted += min * legScenic(l);
    moving += min;
  }
  const highlights = HIGHLIGHTS
    .filter(h => allStops.some(s => distanceKm(s, h) < 1))
    .map(h => h.highlight);
  return {
    profile, legs,
    dep: legs[0].dep, arr: legs.at(-1).arr, duration: legs.at(-1).arr - legs[0].dep,
    transfers: Math.max(0, legs.filter(l => l.kind === 'ride').length - 1),
    countries: [...new Set(allStops.map(s => s.country).filter(Boolean))],
    crossings: legs.flatMap(l => l.crossings),
    scenic: moving ? weighted / moving : 0,
    highlights,
    modes: [...new Set(legs.map(l => l.line ? l.line.mode : l.kind))],
    notices: notices(legs, ctx),
  };
}

// Generalised cost used to pick the scenic option among candidates (lower is better).
export function scenicCost(route, startMin) {
  let cost = Math.max(0, route.dep - startMin) * 0.6 + route.transfers * 8;
  let prevArr = route.dep;
  for (const l of route.legs) {
    cost += Math.max(0, l.dep - prevArr) * 0.6;
    cost += (l.arr - l.dep) * (l.line ? 1.3 - l.line.scenic : l.kind === 'bike' ? 0.5 : 0.7);
    prevArr = l.arr;
  }
  return cost;
}

function notices(legs, { party, bikeLegs, stepFree }) {
  const list = [];
  const rides = legs.filter(l => l.kind === 'ride');
  const persons = party.adults + party.kids;
  const crossings = legs.flatMap(l => l.crossings);
  const nonEu = c => c === 'CH' || c === 'LI';
  const customs = crossings.some(c => nonEu(c.from) !== nonEu(c.to));

  if (party.bikes > 0) {
    for (const l of rides) {
      const params = { line: l.line.label };
      if (l.line.bikes === 'reservation') list.push({ key: 'notice.bikeReservation', params });
      if (l.line.bikes === 'limited') list.push({ key: 'notice.bikeLimited', params });
      if (l.line.bikes === 'unknown') list.push({ key: 'notice.bikeCheck', params });
    }
    if (party.bikes >= 3) list.push({ key: 'notice.bikeGroup', params: { count: party.bikes } });
    if (bikeLegs && legs.some(l => l.kind === 'bike')) list.push({ key: 'notice.bikeLegs' });
  }
  for (const l of rides) if (l.line.season) list.push({ key: 'notice.seasonal', params: { line: l.line.name ?? l.line.label } });
  if (party.dogs > 0) {
    list.push({ key: 'notice.dogs' });
    if (customs) list.push({ key: 'notice.dogBorder' });
  }
  if (party.kids > 0) list.push({ key: 'notice.kids' });
  if (persons >= 10) list.push({ key: 'notice.group' });
  if (stepFree) list.push({ key: 'notice.stepFree' });
  if (customs) list.push({ key: 'notice.customs' });
  if (crossings.length) list.push({ key: 'notice.bodenseeTicket' });
  return dedupeNotices(list);
}

export function dedupeNotices(list) {
  const seen = new Set();
  return list.filter(n => {
    const id = n.key + JSON.stringify(n.params ?? {});
    return !seen.has(id) && seen.add(id);
  });
}
