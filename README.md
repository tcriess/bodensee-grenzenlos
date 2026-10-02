# Bodensee grenzenlos

Hackathon-Prototyp ([Crossing Forward](https://crossing-forward.eu)): grenzüberschreitendes ÖV-Routing in der Vierländerregion Bodensee (CH, DE, AT, LI) mit Bahn, Bus, Schiff, Bergbahn, Fussweg und optional Velo.

**Live:** https://tcriess.github.io/bodensee-grenzenlos/

## Datenquellen

Umschaltbar oben rechts:

- **Echter Fahrplan** (Standard): [Transitous](https://transitous.org), ein Community-Dienst auf Basis von [MOTIS](https://github.com/motis-project/motis) mit offenen GTFS-Daten (u. a. opentransportdata.swiss, DELFI, ÖBB). Enthalten sind Bahn, Bus, die Kursschiffe von BSB/SBS/URh, die Fähre Konstanz–Meersburg sowie Echtzeit, wo verfügbar. Abfragen laufen direkt aus dem Browser (CORS offen), ein Backend ist nicht nötig.
- **Demo-Netz** (offline): vereinfachtes Netz in `src/data/network.js`. Es dient als automatischer Fallback, wenn Transitous nicht erreichbar ist oder nichts findet, auch für einzelne Etappen von Tagesausflügen.

**Nutzungsbedingungen Transitous** ([Policy](https://transitous.org/api/)): nur für nicht-kommerzielle Open-Source-Projekte, sparsame Nutzung, sichtbarer Link auf die [Datenquellen](https://transitous.org/sources/) (ist in der App vorhanden). Vor intensiverer Nutzung der Routing-API das Transitous-Team kontaktieren. Für mehr Last oder einen kommerziellen Einsatz MOTIS selbst betreiben (Docker, gleiche API), mit den GTFS-Feeds der Region.

Damit die Last klein bleibt: Antworten werden im Speicher zwischengespeichert, die Haltestellensuche wartet 350 ms nach dem letzten Tastendruck, und pro Suche gehen 2 Abfragen raus (bei «Schön» ohne Schiff höchstens eine weitere Via-Abfrage).

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

- **Schnell oder Schön**: «Schön» gewichtet Fahrzeit nach Aussicht. Die Route darf dabei höchstens doppelt so lang dauern wie die schnellste (mindestens +90 min). Die jeweils andere Variante wird als Alternative angezeigt.
  - Demo-Netz: Aussichtswert pro Linie (`scenic` 0–1)
  - echter Fahrplan: Wert nach Verkehrsmittel (Schiff, Bergbahn) und Anteil der Halte am Seeufer (`src/data/scenery.js`). Zusätzlich gibt es eine optionale Via-Suche über die günstigste Schiffsanlegestelle (`src/data/hubs.js`, erzeugt mit `node tools/resolve-hubs.mjs`).
- **Reisegruppe**: Erwachsene, Kinder, Hunde, Velos, dazu «stufenlos» (Rollstuhl/Kinderwagen; mit echtem Fahrplan als `pedestrianProfile=WHEELCHAIR`). Velos schliessen Linien ohne Velomitnahme aus. Fahren alle Personen Velo, sind Teilstrecken auf dem Bodensee-Radweg möglich. Daraus ergeben sich passende Hinweise: Velo-Reservation, Hundebillett, Heimtierausweis an der EU-Aussengrenze, Zoll, Gruppenbillett, Bodensee Ticket.
- **Grenzübertritte** werden pro Teilstrecke angezeigt.
- **Tagesausflüge (Beta)**: kuratierte Touren mit Aufenthaltszeiten, auf Wunsch ab dem eigenen «Von»-Ort und zurück.
- **i18n**: `src/locales/*.js` (de-CH als Fallback, en). Für eine neue Sprache die Datei kopieren und in `src/i18n.js` registrieren.

## Aufbau

| Datei | Inhalt |
|---|---|
| `src/data/network.js` | Haltestellen, Linien (Takt, Fahrzeiten, Saison, Velo, Aussicht), Fusswege, Radwege |
| `src/data/tours.js` | Tagesausflüge |
| `src/data/scenery.js`, `src/data/hubs.js` | Seeufer-Punkte und Schiffsanlegestellen für «Schön» |
| `src/router.js` | Demo-Netz: zeitabhängige Suche (Label-Setting), Profile, Touren; ohne DOM |
| `src/providers/transitous.js` | Transitous-Client: Abfragen, Umwandlung ins gemeinsame Modell, Auswahl schnell/schön |
| `src/providers/demo.js`, `src/planner.js` | Wahl der Datenquelle, Fallback, Tagesausflüge etappenweise |
| `src/journey.js` | gemeinsames Modell: Länder, Grenzen, Aussichtswert, Hinweise |
| `src/main.js` | UI, Karte (Leaflet + OSM), URL-Zustand |

## Grenzen und nächste Schritte

- Velos: Die Feeds der Region enthalten keine Angaben zur Velomitnahme (`requireBikeTransport` liefert null Treffer). Die Velo-Hinweise leiten sich deshalb aus dem Verkehrsmittel ab.
- Länder werden über die Zeitzone der Haltestelle bestimmt; Liechtenstein über einen groben Umriss, weil Schweizer Feeds dort «Europe/Zurich» angeben.
- Die Pfänderbahn fehlt in den offenen Daten (Transitous findet einen Landbus); die Demo-Daten des Netzes sind weiterhin geschätzt.

Nächste Schritte:
- Aussicht-Werte pro Streckenabschnitt statt pro Linie, ergänzt um Wetter und Sonnenuntergang
- Tagestouren generieren statt kuratieren (Highlights + Zeitbudget)
- Preise und Billett-Empfehlung, Barrierefreiheit (stufenlos, Kinderwagen)
