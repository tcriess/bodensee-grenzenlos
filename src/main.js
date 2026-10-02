import * as network from './data/network.js';
import { TOURS } from './data/tours.js';
import { parseHM } from './router.js';
import { planJourney, planTourJourney } from './planner.js';
import { searchStops } from './providers/transitous.js';
import { dedupeNotices, distanceKm } from './journey.js';
import { t, pick, setLang, getLang, applyStatic } from './i18n.js';

const { STOPS } = network;

const MODE_ICON = { train: '🚆', ship: '⛴️', bus: '🚌', cablecar: '🚡', walk: '🚶', bike: '🚲' };
const PARTY = [
  { key: 'adults', icon: '🧑', min: 0, max: 30 },
  { key: 'kids', icon: '🧒', min: 0, max: 30 },
  { key: 'dogs', icon: '🐕', min: 0, max: 5 },
  { key: 'bikes', icon: '🚲', min: 0, max: 30 },
];

const state = {
  source: 'live',
  party: { adults: 1, kids: 0, dogs: 0, bikes: 0 },
  // Re-rendered on language change, so results switch language without a new search.
  lastRender: null,
  controller: null,
};

const $ = id => document.getElementById(id);
const esc = s => String(s ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const cssVar = name => getComputedStyle(document.documentElement).getPropertyValue(`--${name}`).trim();

// ---------- Formatting ----------
const fmtTime = min => {
  const m = ((min % 1440) + 1440) % 1440;
  return `${String(Math.floor(m / 60)).padStart(2, '0')}:${String(m % 60).padStart(2, '0')}`;
};
const fmtDuration = min => {
  const h = Math.floor(min / 60), m = min % 60;
  return h ? `${h} h${m ? ` ${m} min` : ''}` : `${m} min`;
};
const flag = c => (c ? `<span class="flag flag-${c}" title="${esc(t(`country.${c}`))}">${c}</span>` : '');
const meter = v => `<span class="meter" aria-label="${Math.round(v * 5)}/5">${
  [1, 2, 3, 4, 5].map(i => `<i class="${v * 5 >= i - 0.5 ? 'on' : ''}"></i>`).join('')}</span>`;
const legMode = leg => (leg.line ? leg.line.mode : leg.kind);

// ---------- Places ----------
// A place is { label, name, lat, lon, country, demoId?, stopId? }; inputs resolve labels via this registry.
const known = new Map();
const remember = place => { known.set(place.label.toLowerCase(), place); return place; };
const demoPlace = id => ({ ...STOPS[id], label: STOPS[id].name, demoId: id });
Object.keys(STOPS).forEach(id => remember(demoPlace(id)));

function resolvePlace(value) {
  const v = value.trim().toLowerCase();
  if (!v) return null;
  if (known.has(v)) return known.get(v);
  const hits = [...known.keys()].filter(k => k.includes(v));
  return hits.length === 1 ? known.get(hits[0]) : null;
}

function setOptions(places) {
  $('stop-list').innerHTML = places
    .map(p => `<option value="${esc(p.label)}">${esc(p.country ? t(`country.${p.country}`) : '')}</option>`).join('');
}
const demoMatches = text => Object.keys(STOPS).map(demoPlace)
  .filter(p => !text || p.label.toLowerCase().includes(text.toLowerCase()))
  .sort((a, b) => a.label.localeCompare(b.label, 'de'));

let suggestTimer, suggestController;
function suggest(text) {
  clearTimeout(suggestTimer);
  setOptions(demoMatches(text));
  if (state.source !== 'live' || text.trim().length < 3 || known.has(text.trim().toLowerCase())) return;
  // Debounced to keep the load on the shared Transitous API low.
  suggestTimer = setTimeout(async () => {
    suggestController?.abort();
    suggestController = new AbortController();
    try {
      const live = (await searchStops(text.trim(), suggestController.signal)).map(remember);
      const labels = new Set();
      setOptions([...demoMatches(text), ...live].filter(p => !labels.has(p.label) && labels.add(p.label)).slice(0, 15));
    } catch { /* suggestions are optional */ }
  }, 350);
}
for (const id of ['from', 'to']) $(id).addEventListener('input', e => suggest(e.target.value));

const placeToParam = p => p.demoId ?? `${p.lat.toFixed(5)},${p.lon.toFixed(5)}~${p.label}`;
function placeFromParam(v) {
  if (!v) return null;
  if (STOPS[v]) return demoPlace(v);
  const [coords, label] = v.split('~');
  const [lat, lon] = coords.split(',').map(Number);
  if (!label || !Number.isFinite(lat) || !Number.isFinite(lon)) return null;
  return remember({ label, name: label, lat, lon, country: null });
}

// ---------- Party counters ----------
function renderCounters() {
  $('counters').innerHTML = PARTY.map(({ key, icon, min, max }) => {
    const label = t(`party.${key}`), v = state.party[key];
    return `<div class="counter">
      <span class="counter-label"><span class="counter-icon" aria-hidden="true">${icon}</span>${esc(label)}</span>
      <button type="button" data-key="${key}" data-step="-1" aria-label="${esc(t('party.less', { label }))}" ${v <= min ? 'disabled' : ''}>−</button>
      <output aria-live="polite">${v}</output>
      <button type="button" data-key="${key}" data-step="1" aria-label="${esc(t('party.more', { label }))}" ${v >= max ? 'disabled' : ''}>+</button>
    </div>`;
  }).join('');
  const persons = state.party.adults + state.party.kids;
  $('bike-legs-wrap').hidden = !(state.party.bikes > 0 && state.party.bikes >= persons && persons > 0);
}
$('counters').addEventListener('click', e => {
  const btn = e.target.closest('button[data-key]');
  if (!btn) return;
  const def = PARTY.find(p => p.key === btn.dataset.key);
  state.party[def.key] = Math.min(def.max, Math.max(def.min, state.party[def.key] + Number(btn.dataset.step)));
  renderCounters();
  $('counters').querySelector(`button[data-key="${def.key}"][data-step="${btn.dataset.step}"]`)?.focus();
});

// ---------- Query ----------
function readQuery() {
  const date = new Date(`${$('date').value}T00:00`);
  return {
    from: resolvePlace($('from').value),
    to: resolvePlace($('to').value),
    date: isNaN(date) ? new Date(new Date().setHours(0, 0, 0, 0)) : date,
    startMin: $('time').value ? parseHM($('time').value) : 8 * 60,
    profile: document.querySelector('input[name="profile"]:checked').value,
    party: { ...state.party },
    bikeLegs: !$('bike-legs-wrap').hidden && $('bike-legs').checked,
    stepFree: $('step-free').checked,
  };
}
function showError(key) {
  $('form-error').hidden = !key;
  $('form-error').textContent = key ? t(key) : '';
}
function setBusy(busy) {
  $('search-btn').disabled = busy;
  $('search-btn').setAttribute('aria-busy', String(busy));
}
const loadingHtml = () => `<div class="card loading"><span class="spinner" aria-hidden="true"></span>${esc(t('result.loading'))}</div>`;
const noticesHtml = list => (list.length
  ? `<div><p class="notices-title">${esc(t('result.notices'))}</p><ul class="notices">${
    list.map(n => `<li>${esc(t(n.key, n.params))}</li>`).join('')}</ul></div>`
  : '');

function newController() {
  state.controller?.abort();
  state.controller = new AbortController();
  return state.controller.signal;
}

async function runSearch() {
  const q = readQuery();
  if (!q.from || !q.to) return showError('error.stopUnknown');
  if (q.from === q.to || distanceKm(q.from, q.to) < 0.2) return showError('error.sameStop');
  if (q.party.adults + q.party.kids < 1) return showError('error.noTraveller');
  showError(null);
  selectTab('route');
  writeUrl(q);

  const signal = newController();
  setBusy(true);
  $('results').innerHTML = loadingHtml();
  const show = (res, pending) => {
    state.lastRender = () => renderJourney(res, q, pending);
    state.lastRender();
  };
  try {
    show(await planJourney(state.source, q, signal, partial => show(partial, true)), false);
  } catch (e) {
    if (e.name !== 'AbortError') { console.error(e); show(null, false); }
  } finally {
    if (!signal.aborted) setBusy(false);
  }
}

function renderJourney(res, q, pending) {
  const main = res?.[q.profile];
  if (!main) {
    $('results').innerHTML = `<div class="card"><p class="error">${esc(t('error.noRoute'))}</p></div>`;
    drawRoutes([]);
    return;
  }
  const other = q.profile === 'fast' ? 'scenic' : 'fast';
  const banner = res.fallback ? `<p class="banner">${esc(t(`result.fallback.${res.fallback}`))}</p>` : '';
  const pendingNote = pending ? `<p class="muted loading-inline"><span class="spinner" aria-hidden="true"></span>${esc(t('result.searchingScenic'))}</p>` : '';
  $('results').innerHTML = `<article class="card result">${banner}${sourceBadge(main)}${routeHtml(main)}${pendingNote}${altHtml(main, res[other], other)}</article>`;
  drawRoutes([main]);
}

const sourceBadge = r => `<span class="source source-${r.source}">${esc(t(`source.badge.${r.source}`))}</span>`;

// ---------- Rendering ----------
function routeHtml(r, { compact = false } = {}) {
  const nextDay = r.arr >= 1440 ? ` <small>${esc(t('result.nextDay'))}</small>` : '';
  const transfers = r.transfers ? t('result.transfers', { count: r.transfers }) : t('result.direct');
  const head = compact
    ? `<p class="segment-head">${fmtTime(r.dep)} – ${fmtTime(r.arr)} · ${fmtDuration(r.duration)}</p>`
    : `<div class="summary">
        <span class="summary-time">${fmtTime(r.dep)} – ${fmtTime(r.arr)}${nextDay}</span>
        <span class="summary-dur">${fmtDuration(r.duration)} · ${esc(transfers)}</span>
      </div>
      <div class="facts">
        <span class="chip">${r.modes.map(m => `<span title="${esc(t(`mode.${m}`))}">${MODE_ICON[m]}</span>`).join(' ')}</span>
        <span class="chip">${r.countries.map(flag).join(' ')}</span>
        <span class="chip">${esc(t('result.scenic'))} ${meter(r.scenic)}</span>
      </div>
      ${r.highlights.length ? `<div class="facts"><span class="muted">${esc(t('result.highlights'))}:</span>
        ${r.highlights.map(h => `<span class="chip">✨ ${esc(t(`highlight.${h}`))}</span>`).join('')}</div>` : ''}`;
  return `${head}<ol class="legs">${r.legs.map(legHtml).join('')}</ol>${compact ? '' : noticesHtml(r.notices)}`;
}

function legHtml(leg) {
  const mode = legMode(leg);
  const color = `var(--${mode})`;
  let meta;
  if (leg.line) {
    meta = `<span class="line-badge" style="--c:${color}">${MODE_ICON[mode]} ${esc(leg.line.label)}</span>
      ${leg.line.name ? `<span>${esc(leg.line.name)}</span>` : ''}
      <span>${esc(leg.line.operator)}</span>
      ${leg.headsign ? `<span>${esc(t('leg.direction', { stop: leg.headsign }))}</span>` : ''}`;
  } else {
    meta = `<span class="line-badge" style="--c:${color}">${MODE_ICON[mode]}</span>
      ${esc(leg.kind === 'bike' ? t(leg.km ? 'leg.bike' : 'leg.bikeShort', { km: leg.km }) : t('leg.walk'))}`;
  }
  meta += `<span>· ${fmtDuration(leg.arr - leg.dep)}</span>`;
  if (leg.realtime) meta += `<span class="rt" title="${esc(t('leg.realtime'))}">● ${esc(t('leg.realtime'))}</span>`;

  const between = leg.stops.slice(1, -1);
  const intermediate = between.length
    ? `<details><summary>${esc(t('leg.stops', { count: between.length }))}</summary><ol>${
      between.map(s => `<li>${fmtTime(s.time)} ${esc(s.name)}</li>`).join('')}</ol></details>`
    : '';
  const borders = (leg.crossings ?? []).map(c =>
    `<span class="border-cross">🛂 ${esc(t('leg.border', { from: t(`country.${c.from}`), to: t(`country.${c.to}`) }))}</span>`).join('');
  const delay = leg.delay > 0 ? ` <span class="delay">+${leg.delay}</span>` : '';

  return `<li class="leg">
    <div class="leg-times"><span>${fmtTime(leg.dep)}${delay}</span><span>${fmtTime(leg.arr)}</span></div>
    <div class="leg-bar ${!leg.line || mode === 'ship' ? 'dashed' : ''}" style="--c:${color}"></div>
    <div class="leg-body">
      <span class="leg-stop">${flag(leg.from.country)} ${esc(leg.from.name)}</span>
      <span class="leg-meta">${meta}</span>
      ${intermediate}${borders}
      <span class="leg-stop">${flag(leg.to.country)} ${esc(leg.to.name)}</span>
    </div>
  </li>`;
}

const sameRoute = (a, b) => a.legs.length === b.legs.length
  && a.legs.every((l, i) => l.dep === b.legs[i].dep && l.arr === b.legs[i].arr && l.line?.label === b.legs[i].line?.label);

function altHtml(main, alt, altProfile) {
  if (!alt) return '';
  // A "faster" option that doesn't arrive earlier, or a "scenic" one that isn't more scenic, is no alternative.
  const pointless = altProfile === 'fast' ? alt.arr >= main.arr : alt.scenic <= main.scenic;
  if (sameRoute(main, alt) || pointless) return `<p class="alt">${esc(t('result.same'))}</p>`;
  const label = altProfile === 'fast' ? t('result.altFast') : t('result.altScenic');
  return `<div class="alt">
    <span><strong>${esc(label)}:</strong> ${fmtTime(alt.dep)} – ${fmtTime(alt.arr)} · ${fmtDuration(alt.duration)}
      ${alt.modes.map(m => MODE_ICON[m]).join(' ')} ${meter(alt.scenic)}</span>
    <button type="button" class="secondary" data-alt="${altProfile}">${esc(t('result.showAlt'))}</button>
  </div>`;
}
$('results').addEventListener('click', e => {
  const btn = e.target.closest('button[data-alt]');
  if (!btn) return;
  // Responses are memoised, so switching profile re-renders without hitting the API again.
  document.querySelector(`input[name="profile"][value="${btn.dataset.alt}"]`).checked = true;
  runSearch();
});

// ---------- Tours ----------
function renderTours() {
  $('tours').innerHTML = TOURS.map(tour => {
    const countries = [...new Set(tour.waypoints.map(w => STOPS[w.stop].country))];
    return `<article class="card tour-card">
      <h3>${esc(pick(tour.title))}</h3>
      <p>${esc(pick(tour.text))}</p>
      <div class="facts"><span class="chip">${countries.map(flag).join(' ')}</span>
        <span class="chip">${tour.waypoints.map(w => esc(STOPS[w.stop].name)).join(' → ')}</span></div>
      <button type="button" class="secondary" data-tour="${tour.id}">${esc(t('tours.plan'))}</button>
    </article>`;
  }).join('');
}
$('tours').addEventListener('click', e => {
  const btn = e.target.closest('button[data-tour]');
  if (btn) runTour(TOURS.find(x => x.id === btn.dataset.tour));
});

async function runTour(tour) {
  const q = readQuery();
  if (q.party.adults + q.party.kids < 1) return showError('error.noTraveller');
  showError(null);
  const stops = tour.waypoints.map(w => ({ place: demoPlace(w.stop), stay: w.stay }));
  const home = q.from && !stops.some(w => distanceKm(w.place, q.from) < 1) ? q.from : null;
  const waypoints = home ? [{ place: home }, ...stops, { place: home }] : stops;
  // Starting from home uses the chosen departure time; otherwise the tour's suggested start.
  const startMin = home ? q.startMin : parseHM(tour.start);
  writeUrl(q, tour.id);

  const signal = newController();
  $('tour-result').innerHTML = loadingHtml();
  $('tour-result').scrollIntoView({ behavior: 'smooth', block: 'start' });
  let plan;
  try {
    plan = await planTourJourney(state.source, waypoints, { ...q, startMin }, signal);
  } catch (e) {
    if (e.name === 'AbortError') return;
    plan = { segments: [], failedAt: waypoints[1].place };
  }
  state.lastRender = () => renderTour(tour, home, plan);
  state.lastRender();
}

function renderTour(tour, home, plan) {
  const parts = plan.segments.map(seg => `${seg.fallback ? `<p class="banner">${esc(t('tours.segmentFallback'))}</p>` : ''}${
    routeHtml(seg.route, { compact: true })}${
    seg.stay ? `<div class="stay">📍 ${esc(t('tours.stay', { duration: fmtDuration(seg.stay), stop: seg.at.label }))}</div>` : ''}`);
  if (plan.failedAt) parts.push(`<p class="error">${esc(t('tours.failed', { stop: plan.failedAt.label }))}</p>`);
  const first = plan.segments[0]?.route, last = plan.segments.at(-1)?.route;
  $('tour-result').innerHTML = `<article class="card result">
    <h3 style="margin:0">${esc(pick(tour.title))}</h3>
    ${home ? `<p class="muted">${esc(t('tours.fromHome', { stop: home.label }))}</p>` : ''}
    ${first ? `<p class="summary-dur">${esc(t('tours.summary', { from: fmtTime(first.dep), to: fmtTime(last.arr) }))}</p>` : ''}
    ${parts.join('')}
    ${noticesHtml(dedupeNotices(plan.segments.flatMap(s => s.route.notices)))}
  </article>`;
  drawRoutes(plan.segments.map(s => s.route));
}

// ---------- Shareable URL ----------
function writeUrl(q, tourId) {
  const p = new URLSearchParams();
  if (q.from) p.set('from', placeToParam(q.from));
  if (q.to) p.set('to', placeToParam(q.to));
  p.set('date', $('date').value);
  p.set('time', $('time').value);
  p.set('profile', q.profile);
  if (tourId) p.set('tour', tourId);
  for (const { key } of PARTY) if (q.party[key] !== (key === 'adults' ? 1 : 0)) p.set(key, q.party[key]);
  if (q.bikeLegs) p.set('bikeLegs', '1');
  if (q.stepFree) p.set('stepFree', '1');
  if (state.source !== 'live') p.set('src', state.source);
  if (getLang() !== 'de') p.set('lang', getLang());
  history.replaceState(null, '', `?${p}`);
}
function readUrl() {
  const p = new URLSearchParams(location.search);
  if (p.get('src') === 'demo') state.source = 'demo';
  const from = placeFromParam(p.get('from')), to = placeFromParam(p.get('to'));
  if (from) $('from').value = from.label;
  if (to) $('to').value = to.label;
  if (p.get('date')) $('date').value = p.get('date');
  if (p.get('time')) $('time').value = p.get('time');
  if (p.get('profile') === 'scenic') document.querySelector('input[name="profile"][value="scenic"]').checked = true;
  for (const { key, min, max } of PARTY) {
    const v = Number(p.get(key));
    if (p.has(key) && Number.isInteger(v)) state.party[key] = Math.min(max, Math.max(min, v));
  }
  $('bike-legs').checked = p.get('bikeLegs') === '1';
  $('step-free').checked = p.get('stepFree') === '1';
  const tour = TOURS.find(x => x.id === p.get('tour'));
  if (tour) return () => { selectTab('tours'); runTour(tour); };
  return from && to ? () => runSearch() : null;
}

// ---------- Tabs ----------
function selectTab(name) {
  for (const n of ['route', 'tours']) {
    $(`tab-${n}`).setAttribute('aria-selected', String(n === name));
    $(`pane-${n}`).hidden = n !== name;
  }
}
$('tab-route').addEventListener('click', () => selectTab('route'));
$('tab-tours').addEventListener('click', () => selectTab('tours'));

// ---------- Map ----------
let map, routeLayer, networkLayer;
function initMap() {
  if (!window.L) return; // CDN unreachable: app keeps working without the map
  map = L.map('map', { zoomControl: true }).setView([47.58, 9.35], 9);
  L.tileLayer('https://tile.openstreetmap.org/{z}/{x}/{y}.png', {
    maxZoom: 18, attribution: '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>',
  }).addTo(map);
  networkLayer = L.layerGroup();
  for (const line of network.LINES) {
    const coords = line.stops.map(([s]) => [STOPS[s].lat, STOPS[s].lon]);
    L.polyline(coords, { color: cssVar(line.mode), weight: 2, opacity: 0.45, dashArray: line.mode === 'ship' ? '6 6' : null }).addTo(networkLayer);
  }
  for (const [id, s] of Object.entries(STOPS)) {
    L.circleMarker([s.lat, s.lon], {
      radius: s.highlight ? 6 : 4, color: '#fff', weight: 1.5, fillColor: s.highlight ? cssVar('cablecar') : cssVar('accent'), fillOpacity: 1,
    }).addTo(map).bindPopup(() => `<div class="map-popup"><strong>${esc(s.name)}</strong> ${flag(s.country)}
      ${s.highlight ? `<br>✨ ${esc(t(`highlight.${s.highlight}`))}` : ''}<br>
      <button type="button" class="secondary" data-set="from" data-stop="${id}">${esc(t('map.from'))}</button>
      <button type="button" class="secondary" data-set="to" data-stop="${id}">${esc(t('map.to'))}</button></div>`);
  }
  routeLayer = L.layerGroup().addTo(map);
  $('map').addEventListener('click', e => {
    const btn = e.target.closest('button[data-set]');
    if (!btn) return;
    $(btn.dataset.set).value = STOPS[btn.dataset.stop].name;
    map.closePopup();
  });
  updateNetworkLayer();
}
function updateNetworkLayer() {
  if (!map) return;
  // The demo network lines would be misleading next to real timetables.
  if (state.source === 'demo') networkLayer.addTo(map); else networkLayer.remove();
}
function drawRoutes(routes) {
  if (!map) return;
  routeLayer.clearLayers();
  const bounds = [];
  for (const r of routes) {
    for (const leg of r.legs) {
      const coords = leg.geometry?.length ? leg.geometry : leg.stops.map(s => [s.lat, s.lon]);
      bounds.push(...coords);
      const mode = legMode(leg);
      L.polyline(coords, { color: '#fff', weight: 9, opacity: 0.9 }).addTo(routeLayer);
      L.polyline(coords, { color: cssVar(mode), weight: 5, dashArray: mode === 'walk' || mode === 'bike' ? '4 8' : null }).addTo(routeLayer);
    }
  }
  if (bounds.length) map.fitBounds(bounds, { padding: [30, 30] });
}

// ---------- Language and source ----------
function renderAttribution() {
  $('attribution').innerHTML = state.source === 'live'
    ? `${esc(t('disclaimer.live'))} <a href="https://transitous.org/sources/" target="_blank" rel="noopener">${esc(t('attribution.transitous'))}</a>`
    : esc(t('disclaimer'));
}
function applyLanguage(lang) {
  setLang(lang);
  try { localStorage.setItem('lang', getLang()); } catch { /* storage unavailable */ }
  $('lang').value = getLang();
  applyStatic();
  setOptions(demoMatches(''));
  renderCounters();
  renderTours();
  renderAttribution();
  state.lastRender?.();
}
$('lang').addEventListener('change', e => applyLanguage(e.target.value));
$('source').addEventListener('change', e => {
  state.source = e.target.value;
  renderAttribution();
  updateNetworkLayer();
});

// ---------- Init ----------
function initialLang() {
  const param = new URLSearchParams(location.search).get('lang');
  let stored = null;
  try { stored = localStorage.getItem('lang'); } catch { /* storage unavailable */ }
  return param || stored || (navigator.language?.startsWith('de') ? 'de' : navigator.language?.slice(0, 2)) || 'de';
}

$('swap').addEventListener('click', () => { [$('from').value, $('to').value] = [$('to').value, $('from').value]; });
$('form').addEventListener('submit', e => { e.preventDefault(); runSearch(); });

const now = new Date();
$('date').value = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(now.getDate()).padStart(2, '0')}`;
$('time').value = fmtTime(Math.ceil((now.getHours() * 60 + now.getMinutes()) / 15) * 15);
$('from').value = STOPS.zuerich.name;
$('to').value = STOPS.lindauInsel.name;

const autoRun = readUrl();
$('source').value = state.source;
applyLanguage(initialLang());
initMap();
autoRun?.();
