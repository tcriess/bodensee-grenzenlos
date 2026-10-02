# Bodensee grenzenlos

Hackathon-Prototyp ([Crossing Forward](https://crossing-forward.eu)): grenzüberschreitendes ÖV-Routing in der Vierländerregion Bodensee (CH, DE, AT, LI) mit Bahn, Bus, Schiff, Bergbahn, Fussweg und optional Velo.

## Starten

```bash
npm start      # http://localhost:5173 (keine Abhängigkeiten, Node ≥ 18)
npm test       # Router-Tests (node:test)
```

Teilbare Links, z. B.:
- `/?from=schaffhausen&to=lindauInsel&profile=scenic&adults=2&dogs=1`
- `/?tour=pfaender-lindau&from=konstanz&date=2026-07-10&time=08:00`
- `&lang=en` für Englisch

## Funktionen

- **Schnell oder Schön**: «Schön» gewichtet Fahrzeit nach Aussicht (`scenic` 0–1 pro Linie). Die Route darf dabei höchstens doppelt so lang dauern wie die schnellste (mindestens +90 min). Die jeweils andere Variante wird als Alternative angezeigt.
- **Reisegruppe**: Erwachsene, Kinder, Hunde, Velos. Velos schliessen Linien ohne Velomitnahme aus. Fahren alle Personen Velo, sind Teilstrecken auf dem Bodensee-Radweg möglich. Daraus ergeben sich passende Hinweise: Velo-Reservation, Hundebillett, Heimtierausweis an der EU-Aussengrenze, Zoll, Gruppenbillett, Bodensee Ticket.
- **Grenzübertritte** werden pro Teilstrecke angezeigt.
- **Tagesausflüge (Beta)**: kuratierte Touren mit Aufenthaltszeiten, auf Wunsch ab dem eigenen «Von»-Ort und zurück.
- **i18n**: `src/locales/*.js` (de-CH als Fallback, en). Für eine neue Sprache die Datei kopieren und in `src/i18n.js` registrieren.

## Aufbau

| Datei | Inhalt |
|---|---|
| `src/data/network.js` | Haltestellen, Linien (Takt, Fahrzeiten, Saison, Velo, Aussicht), Fusswege, Radwege |
| `src/data/tours.js` | Tagesausflüge |
| `src/router.js` | zeitabhängige Suche (Label-Setting), Profile, Hinweise, Touren; ohne DOM |
| `src/main.js` | UI, Karte (Leaflet + OSM), URL-Zustand |

## Grenzen und nächste Schritte

Der Fahrplan ist **vereinfacht und ungefähr** (Takt ab erster Haltestelle, symmetrische Fahrzeiten). Nächste Schritte:
- echte Daten: GTFS von opentransportdata.swiss, DELFI (DE), mobilitydata.gv.at (AT), oder ein bestehender Router mit Europa-Abdeckung (z. B. MOTIS/Transitous, OpenTripPlanner)
- Aussicht-Werte pro Streckenabschnitt statt pro Linie, ergänzt um Wetter und Sonnenuntergang
- Tagestouren generieren statt kuratieren (Highlights + Zeitbudget)
- Preise und Billett-Empfehlung, Barrierefreiheit (stufenlos, Kinderwagen)
