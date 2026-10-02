import * as network from './data/network.js';
import { TOURS } from './data/tours.js';
import { buildIndex, planRoute, planTour, parseHM } from './router.js';
import { t, pick, setLang, getLang, applyStatic } from './i18n.js';

const index = buildIndex(network);
const { STOPS } = network;

const MODE_ICON = { train: '🚆', ship: '⛴️', bus: '🚌', cablecar: '🚡', walk: '🚶', bike: '🚲' };
const PARTY = [
  { key: 'adults', icon: '🧑', min: 0, max: 30 },
  { key: 'kids', icon: '🧒', min: 0, max: 30 },
  { key: 'dogs', icon: '🐕', min: 0, max: 5 },
  { key: 'bikes', icon: '🚲', min: 0, max: 30 },
];

const state = {
  party: { adults: 1, kids: 0, dogs: 0, bikes: 0 },
  // Re-run on language change so dynamic content is re-rendered in the new language.
  lastRender: null,
};

const $ = id => document.getElementById(id);
const esc = s => String(s).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
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
const flag = c => `<span class="flag flag-${c}" title="${esc(t(`country.${c}`))}">${c}</span>`;
const meter = v => `<span class="meter" aria-label="${Math.round(v * 5)}/5">${
  [1, 2, 3, 4, 5].map(i => `<i class="${v * 5 >= i - 0.5 ? 'on' : ''}"></i>`).join('')}</span>`;
const stopName = id => STOPS[id].name;
const legMode = leg => (leg.line ? leg.line.mode : leg.kind);

// ---------- Stop inputs ----------
const byName = new Map(Object.entries(STOPS).map(([id, s]) => [s.name.toLowerCase(), id]));
function resolveStop(value) {
  const v = value.trim().toLowerCase();
  if (!v) return null;
  if (byName.has(v)) return byName.get(v);
  const hits = [...byName.keys()].filter(n => n.startsWith(v) || n.includes(v));
  return hits.length === 1 ? byName.get(hits[0]) : null;
}
function fillStopList() {
  $('stop-list').innerHTML = Object.values(STOPS)
    .sort((a, b) => a.name.localeCompare(b.name, 'de'))
    .map(s => `<option value="${esc(s.name)}">${esc(t(`country.${s.country}`))}</option>`).join('');
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
    from: resolveStop($('from').value),
    to: resolveStop($('to').value),
    date: isNaN(date) ? new Date() : date,
    startMin: $('time').value ? parseHM($('time').value) : 8 * 60,
    profile: document.querySelector('input[name="profile"]:checked').value,
    party: { ...state.party },
    bikeLegs: !$('bike-legs-wrap').hidden && $('bike-legs').checked,
  };
}
function showError(key) {
  $('form-error').hidden = !key;
  $('form-error').textContent = key ? t(key) : '';
}

function runSearch(profileOverride) {
  const q = readQuery();
  if (profileOverride) {
    q.profile = profileOverride;
    document.querySelector(`input[name="profile"][value="${profileOverride}"]`).checked = true;
  }
  if (!q.from || !q.to) return showError('error.stopUnknown');
  if (q.from === q.to) return showError('error.sameStop');
  if (q.party.adults + q.party.kids < 1) return showError('error.noTraveller');
  showError(null);
  selectTab('route');

  const render = () => {
    const main = planRoute(index, q);
    if (!main) {
      $('results').innerHTML = `<div class="card"><p class="error">${esc(t('error.noRoute'))}</p></div>`;
      drawRoutes([]);
      return;
    }
    const otherProfile = q.profile === 'fast' ? 'scenic' : 'fast';
    const alt = planRoute(index, { ...q, profile: otherProfile });
    $('results').innerHTML = `<article class="card result">${routeHtml(main)}${altHtml(main, alt, otherProfile)}</article>`;
    drawRoutes([main]);
  };
  state.lastRender = render;
  render();
  writeUrl(q);
}

// ---------- Shareable URL ----------
function writeUrl(q, tourId) {
  const p = new URLSearchParams({ from: q.from, to: q.to, date: $('date').value, time: $('time').value, profile: q.profile });
  if (tourId) p.set('tour', tourId);
  for (const { key } of PARTY) if (q.party[key] !== (key === 'adults' ? 1 : 0)) p.set(key, q.party[key]);
  if (q.bikeLegs) p.set('bikeLegs', '1');
  if (getLang() !== 'de') p.set('lang', getLang());
  history.replaceState(null, '', `?${p}`);
}
function readUrl() {
  const p = new URLSearchParams(location.search);
  for (const k of ['from', 'to']) if (STOPS[p.get(k)]) $(k).value = stopName(p.get(k));
  if (p.get('date')) $('date').value = p.get('date');
  if (p.get('time')) $('time').value = p.get('time');
  if (p.get('profile') === 'scenic') document.querySelector('input[name="profile"][value="scenic"]').checked = true;
  for (const { key, min, max } of PARTY) {
    const v = Number(p.get(key));
    if (p.has(key) && Number.isInteger(v)) state.party[key] = Math.min(max, Math.max(min, v));
  }
  $('bike-legs').checked = p.get('bikeLegs') === '1';
  const tour = TOURS.find(x => x.id === p.get('tour'));
  if (tour) return () => { selectTab('tours'); runTour(tour); };
  return STOPS[p.get('from')] && STOPS[p.get('to')] ? () => runSearch() : null;
}

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

  const legs = `<ol class="legs">${r.legs.map(legHtml).join('')}</ol>`;
  const notices = !compact && r.notices.length
    ? `<div><p class="notices-title">${esc(t('result.notices'))}</p><ul class="notices">${
      r.notices.map(n => `<li>${esc(t(n.key, n.params))}</li>`).join('')}</ul></div>`
    : '';
  return head + legs + notices;
}

function legHtml(leg) {
  const mode = legMode(leg);
  const color = `var(--${mode})`;
  let meta;
  if (leg.line) {
    const name = leg.line.name ? ` ${esc(leg.line.name)}` : '';
    meta = `<span class="line-badge" style="--c:${color}">${MODE_ICON[mode]} ${esc(leg.line.label)}</span>${name}
      <span>${esc(leg.line.operator)}</span>
      <span>${esc(t('leg.direction', { stop: stopName(leg.headsign) }))}</span>`;
  } else {
    meta = `<span class="line-badge" style="--c:${color}">${MODE_ICON[mode]}</span>
      ${esc(leg.kind === 'bike' ? t('leg.bike', { km: leg.km }) : t('leg.walk'))}`;
  }
  meta += `<span>· ${fmtDuration(leg.arr - leg.dep)}</span>`;

  const between = leg.stops.slice(1, -1);
  const intermediate = between.length
    ? `<details><summary>${esc(t('leg.stops', { count: between.length }))}</summary><ol>${
      between.map(s => `<li>${fmtTime(s.time)} ${esc(stopName(s.stop))}</li>`).join('')}</ol></details>`
    : '';
  const borders = leg.crossings.map(c =>
    `<span class="border-cross">🛂 ${esc(t('leg.border', { from: t(`country.${c.from}`), to: t(`country.${c.to}`) }))}</span>`).join('');

  return `<li class="leg">
    <div class="leg-times"><span>${fmtTime(leg.dep)}</span><span>${fmtTime(leg.arr)}</span></div>
    <div class="leg-bar ${leg.line ? (mode === 'ship' ? 'dashed' : '') : 'dashed'}" style="--c:${color}"></div>
    <div class="leg-body">
      <span class="leg-stop">${flag(STOPS[leg.from].country)} ${esc(stopName(leg.from))}</span>
      <span class="leg-meta">${meta}</span>
      ${intermediate}${borders}
      <span class="leg-stop">${flag(STOPS[leg.to].country)} ${esc(stopName(leg.to))}</span>
    </div>
  </li>`;
}

function altHtml(main, alt, altProfile) {
  if (!alt) return '';
  const same = alt.legs.length === main.legs.length
    && alt.legs.every((l, i) => l.line === main.legs[i].line && l.to === main.legs[i].to && l.dep === main.legs[i].dep);
  if (same) return `<p class="alt">${esc(t('result.same'))}</p>`;
  const label = altProfile === 'fast' ? t('result.altFast') : t('result.altScenic');
  return `<div class="alt">
    <span><strong>${esc(label)}:</strong> ${fmtTime(alt.dep)} – ${fmtTime(alt.arr)} · ${fmtDuration(alt.duration)}
      ${alt.modes.map(m => MODE_ICON[m]).join(' ')} ${meter(alt.scenic)}</span>
    <button type="button" class="secondary" data-alt="${altProfile}">${esc(t('result.showAlt'))}</button>
  </div>`;
}
$('results').addEventListener('click', e => {
  const btn = e.target.closest('button[data-alt]');
  if (btn) runSearch(btn.dataset.alt);
});

// ---------- Tours ----------
function renderTours() {
  $('tours').innerHTML = TOURS.map(tour => {
    const countries = [...new Set(tour.waypoints.map(w => STOPS[w.stop].country))];
    return `<article class="card tour-card">
      <h3>${esc(pick(tour.title))}</h3>
      <p>${esc(pick(tour.text))}</p>
      <div class="facts"><span class="chip">${countries.map(flag).join(' ')}</span>
        <span class="chip">${tour.waypoints.map(w => esc(stopName(w.stop))).join(' → ')}</span></div>
      <button type="button" class="secondary" data-tour="${tour.id}">${esc(t('tours.plan'))}</button>
    </article>`;
  }).join('');
}
$('tours').addEventListener('click', e => {
  const btn = e.target.closest('button[data-tour]');
  if (btn) runTour(TOURS.find(x => x.id === btn.dataset.tour));
});

function runTour(tour) {
  const q = readQuery();
  if (q.party.adults + q.party.kids < 1) return showError('error.noTraveller');
  showError(null);
  const home = q.from && !tour.waypoints.some(w => w.stop === q.from) ? q.from : null;
  const waypoints = home ? [{ stop: home }, ...tour.waypoints, { stop: home }] : tour.waypoints;
  // Starting from home uses the chosen departure time; otherwise the tour's suggested start.
  const startMin = home ? q.startMin : parseHM(tour.start);

  const render = () => {
    const plan = planTour(index, { waypoints, date: q.date, startMin, party: q.party, bikeLegs: q.bikeLegs });
    const parts = plan.segments.map(seg => `${routeHtml(seg.route, { compact: true })}${
      seg.stay ? `<div class="stay">📍 ${esc(t('tours.stay', { duration: fmtDuration(seg.stay), stop: stopName(seg.at) }))}</div>` : ''}`);
    if (plan.failedAt) parts.push(`<p class="error">${esc(t('tours.failed', { stop: stopName(plan.failedAt) }))}</p>`);
    const allNotices = dedupe(plan.segments.flatMap(s => s.route.notices));
    const first = plan.segments[0]?.route, last = plan.segments.at(-1)?.route;
    $('tour-result').innerHTML = `<article class="card result">
      <h3 style="margin:0">${esc(pick(tour.title))}</h3>
      ${home ? `<p class="muted">${esc(t('tours.fromHome', { stop: stopName(home) }))}</p>` : ''}
      ${first ? `<p class="summary-dur">${esc(t('tours.summary', { from: fmtTime(first.dep), to: fmtTime(last.arr) }))}</p>` : ''}
      ${parts.join('')}
      ${allNotices.length ? `<div><p class="notices-title">${esc(t('result.notices'))}</p><ul class="notices">${
        allNotices.map(n => `<li>${esc(t(n.key, n.params))}</li>`).join('')}</ul></div>` : ''}
    </article>`;
    drawRoutes(plan.segments.map(s => s.route));
    $('tour-result').scrollIntoView({ behavior: 'smooth', block: 'start' });
  };
  state.lastRender = render;
  render();
  writeUrl({ ...q, from: q.from ?? '', to: q.to ?? '' }, tour.id);
}
function dedupe(notices) {
  const seen = new Set();
  return notices.filter(n => { const k = n.key + JSON.stringify(n.params ?? {}); return !seen.has(k) && seen.add(k); });
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
let map, routeLayer;
function initMap() {
  if (!window.L) return; // CDN unreachable: app keeps working without the map
  map = L.map('map', { zoomControl: true }).setView([47.58, 9.35], 9);
  L.tileLayer('https://tile.openstreetmap.org/{z}/{x}/{y}.png', {
    maxZoom: 18, attribution: '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>',
  }).addTo(map);
  for (const line of network.LINES) {
    const coords = line.stops.map(([s]) => [STOPS[s].lat, STOPS[s].lon]);
    L.polyline(coords, { color: cssVar(line.mode), weight: 2, opacity: 0.45, dashArray: line.mode === 'ship' ? '6 6' : null }).addTo(map);
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
    $(btn.dataset.set).value = stopName(btn.dataset.stop);
    map.closePopup();
  });
}
function drawRoutes(routes) {
  if (!map) return;
  routeLayer.clearLayers();
  const bounds = [];
  for (const r of routes) {
    for (const leg of r.legs) {
      const coords = leg.stops.map(s => [STOPS[s.stop].lat, STOPS[s.stop].lon]);
      bounds.push(...coords);
      const mode = legMode(leg);
      L.polyline(coords, { color: '#fff', weight: 9, opacity: 0.9 }).addTo(routeLayer);
      L.polyline(coords, { color: cssVar(mode), weight: 5, dashArray: mode === 'walk' || mode === 'bike' ? '4 8' : null }).addTo(routeLayer);
    }
  }
  if (bounds.length) map.fitBounds(bounds, { padding: [30, 30] });
}

// ---------- Language ----------
function applyLanguage(lang) {
  setLang(lang);
  try { localStorage.setItem('lang', getLang()); } catch { /* storage unavailable */ }
  $('lang').value = getLang();
  applyStatic();
  fillStopList();
  renderCounters();
  renderTours();
  state.lastRender?.();
}
$('lang').addEventListener('change', e => applyLanguage(e.target.value));

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

const autoSearch = readUrl();
applyLanguage(initialLang());
initMap();
autoSearch?.();
