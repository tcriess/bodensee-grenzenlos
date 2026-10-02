// Time-dependent label-setting search over a headway-based network. Pure module, no DOM.
import { summarize } from './journey.js';

export const MIN_TRANSFER = 4;
const HORIZON = 26 * 60;

const PROFILES = {
  fast:   { ride: () => 1,     wait: 1,   transfer: 5, walk: 1,   bike: 1 },
  // Scenic lines get cheap so the search prefers ships and lake views as long as the deadline allows.
  scenic: { ride: s => 1.3 - s, wait: 0.6, transfer: 8, walk: 0.7, bike: 0.5 },
};

export const parseHM = s => { const [h, m] = s.split(':').map(Number); return h * 60 + m; };

export function inSeason(line, date) {
  if (!line.season) return true;
  const md = `${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`;
  const [a, b] = line.season;
  return a <= b ? md >= a && md <= b : md >= a || md <= b;
}

export function buildIndex({ STOPS, LINES, FOOTPATHS = [], BIKEWAYS = [], BIKE_KMH = 15 }) {
  const byStop = Object.fromEntries(Object.keys(STOPS).map(id => [id, []]));
  const patterns = [];
  for (const line of LINES) {
    const deps = line.deps ? line.deps.map(parseHM) : range(parseHM(line.first), parseHM(line.last), line.every);
    const fwd = { line, dir: 1, stops: line.stops.map(s => s[0]), offs: line.stops.map(s => s[1]), deps };
    const total = fwd.offs.at(-1);
    const rev = { line, dir: -1, stops: [...fwd.stops].reverse(), offs: [...fwd.offs].reverse().map(o => total - o), deps };
    for (const p of [fwd, rev]) {
      patterns.push(p);
      p.stops.forEach((s, idx) => {
        if (!byStop[s]) throw new Error(`Unknown stop ${s} in line ${line.id}`);
        if (idx < p.stops.length - 1) byStop[s].push({ pattern: p, idx });
      });
    }
  }
  const links = Object.fromEntries(Object.keys(STOPS).map(id => [id, []]));
  for (const [a, b, min] of FOOTPATHS) {
    links[a].push({ kind: 'walk', to: b, min });
    links[b].push({ kind: 'walk', to: a, min });
  }
  for (const [a, b, km] of BIKEWAYS) {
    const min = Math.round(km / BIKE_KMH * 60);
    links[a].push({ kind: 'bike', to: b, min, km });
    links[b].push({ kind: 'bike', to: a, min, km });
  }
  return { stops: STOPS, patterns, byStop, links };
}

function range(from, to, step) {
  const out = [];
  for (let t = from; t <= to; t += step) out.push(t);
  return out;
}

function nextDeparture(pattern, idx, t) {
  const off = pattern.offs[idx];
  for (const d of pattern.deps) if (d + off >= t) return d + off;
  return null;
}

function search(index, ctx, from, to, startMin, profileName, deadline) {
  const profile = PROFILES[profileName];
  const best = { [from]: 0 };
  const settled = new Set();
  const queue = [{ stop: from, time: startMin, cost: 0, prev: null, leg: null }];

  while (queue.length) {
    let bi = 0;
    for (let i = 1; i < queue.length; i++) if (queue[i].cost < queue[bi].cost) bi = i;
    const label = queue.splice(bi, 1)[0];
    if (settled.has(label.stop)) continue;
    settled.add(label.stop);
    if (label.stop === to) return unwind(label);

    const lastLine = label.leg?.kind === 'ride' ? label.leg.pattern.line : null;
    const push = (stop, time, cost, leg) => {
      if (time > deadline || time > HORIZON || settled.has(stop)) return;
      if (best[stop] !== undefined && best[stop] <= cost) return;
      best[stop] = cost;
      queue.push({ stop, time, cost, prev: label, leg });
    };

    for (const { pattern, idx } of index.byStop[label.stop]) {
      const line = pattern.line;
      if (line === lastLine || !ctx.lineAllowed(line)) continue;
      const ready = label.time + (lastLine ? MIN_TRANSFER : label.leg ? 1 : 0);
      const dep = nextDeparture(pattern, idx, ready);
      if (dep === null) continue;
      const boardCost = (dep - label.time) * profile.wait + (label.leg ? profile.transfer : 0);
      for (let j = idx + 1; j < pattern.stops.length; j++) {
        const arr = dep + pattern.offs[j] - pattern.offs[idx];
        const cost = label.cost + boardCost + (arr - dep) * profile.ride(line.scenic);
        push(pattern.stops[j], arr, cost, { kind: 'ride', pattern, fromIdx: idx, toIdx: j, dep, arr });
      }
    }
    for (const link of index.links[label.stop]) {
      if (link.kind === 'bike' && !ctx.bikeLegs) continue;
      const arr = label.time + link.min;
      push(link.to, arr, label.cost + link.min * profile[link.kind],
        { kind: link.kind, from: label.stop, to: link.to, dep: label.time, arr, km: link.km });
    }
  }
  return null;
}

function unwind(label) {
  const legs = [];
  for (let l = label; l.leg; l = l.prev) legs.unshift(l.leg);
  return legs;
}

export function makeContext({ date, party, bikeLegs, stepFree = false }) {
  const persons = party.adults + party.kids;
  return {
    date, party, stepFree,
    bikeLegs: Boolean(bikeLegs) && party.bikes > 0 && party.bikes >= persons,
    lineAllowed: line => inSeason(line, date) && !(party.bikes > 0 && line.bikes === 'no'),
  };
}

export function planRoute(index, { from, to, date, startMin, profile = 'fast', party, bikeLegs = false, stepFree = false }) {
  if (from === to) return null;
  const ctx = makeContext({ date, party, bikeLegs, stepFree });
  const fast = search(index, ctx, from, to, startMin, 'fast', Infinity);
  if (!fast) return null;
  if (profile === 'fast') return describe(index, fast, ctx, 'fast');
  const fastArr = fast.at(-1).arr;
  // Scenic may take longer, but at most twice the fastest travel time (min. +90 min).
  const deadline = fastArr + Math.max(90, fastArr - fast[0].dep);
  const scenic = search(index, ctx, from, to, startMin, 'scenic', deadline) ?? fast;
  return describe(index, scenic, ctx, 'scenic');
}

export function describe(index, legs, ctx, profile) {
  const place = id => ({ id, ...index.stops[id] });
  const out = legs.map(leg => {
    const ids = leg.kind === 'ride' ? leg.pattern.stops.slice(leg.fromIdx, leg.toIdx + 1) : [leg.from, leg.to];
    const stops = ids.map((id, i) => ({
      ...place(id),
      time: leg.kind === 'ride' ? leg.dep + leg.pattern.offs[leg.fromIdx + i] - leg.pattern.offs[leg.fromIdx] : i ? leg.arr : leg.dep,
    }));
    return {
      kind: leg.kind,
      line: leg.kind === 'ride' ? leg.pattern.line : null,
      headsign: leg.kind === 'ride' ? index.stops[leg.pattern.stops.at(-1)].name : null,
      from: stops[0], to: stops.at(-1), dep: leg.dep, arr: leg.arr, stops, km: leg.km,
    };
  });
  return { ...summarize(out, ctx, profile), source: 'demo' };
}

// Chains scenic routes through waypoints; each waypoint has a stay in minutes before moving on.
export function planTour(index, { waypoints, date, startMin, party, bikeLegs, profile = 'scenic' }) {
  const segments = [];
  let t = startMin;
  for (let i = 1; i < waypoints.length; i++) {
    const from = waypoints[i - 1].stop, to = waypoints[i].stop;
    if (from === to) continue;
    const route = planRoute(index, { from, to, date, startMin: t, profile, party, bikeLegs });
    if (!route) return { segments, failedAt: to };
    segments.push({ route, stay: waypoints[i].stay ?? 0, at: to });
    t = route.arr + (waypoints[i].stay ?? 0);
  }
  return { segments, failedAt: null };
}
