// Curated day trips; each waypoint stay is in minutes. Texts inline per language, German is the fallback.
export const TOURS = [
  {
    id: 'dreilaender-schiff',
    title: { de: 'Drei Länder an einem Tag', en: 'Three countries in one day' },
    text: { de: 'Mit dem Kursschiff von Konstanz über Meersburg nach Lindau und Bregenz, zurück mit der Bahn.',
            en: 'By lake boat from Konstanz via Meersburg to Lindau and Bregenz, back by train.' },
    start: '09:00',
    waypoints: [{ stop: 'konstanz' }, { stop: 'meersburg', stay: 30 }, { stop: 'lindauInsel', stay: 90 }, { stop: 'bregenz', stay: 60 }, { stop: 'konstanz' }],
  },
  {
    id: 'rheinfall-stein',
    title: { de: 'Rheinfall und Stein am Rhein', en: 'Rhine Falls and Stein am Rhein' },
    text: { de: 'Europas grösster Wasserfall, dann Fachwerk in Stein am Rhein und mit dem Schiff bis Konstanz.',
            en: 'Europe’s largest waterfall, half-timbered Stein am Rhein, then by boat to Konstanz.' },
    start: '09:00',
    waypoints: [{ stop: 'schaffhausen' }, { stop: 'neuhausen', stay: 75 }, { stop: 'steinamrhein', stay: 90 }, { stop: 'konstanz' }],
  },
  {
    id: 'pfaender-lindau',
    title: { de: 'Pfänder und Lindau', en: 'Pfänder and Lindau' },
    text: { de: 'Mit der Bergbahn auf den Pfänder – Blick über den ganzen See – und danach Bummel auf der Insel Lindau.',
            en: 'Cable car up the Pfänder for a view over the whole lake, then a stroll on Lindau island.' },
    start: '09:30',
    waypoints: [{ stop: 'bregenz' }, { stop: 'pfaender', stay: 90 }, { stop: 'lindauInsel', stay: 120 }, { stop: 'bregenz' }],
  },
  {
    id: 'mainau-pfahlbauten',
    title: { de: 'Blumeninsel und Pfahlbauten', en: 'Flower island and lake dwellings' },
    text: { de: 'Mainau, Pfahlbauten in Unteruhldingen und die Altstadt von Meersburg, zurück mit der Fähre.',
            en: 'Mainau, the lake dwellings at Unteruhldingen and Meersburg old town, back by ferry.' },
    start: '09:00',
    waypoints: [{ stop: 'konstanz' }, { stop: 'mainau', stay: 150 }, { stop: 'unteruhldingen', stay: 90 }, { stop: 'meersburg', stay: 60 }, { stop: 'konstanz' }],
  },
  {
    id: 'liechtenstein',
    title: { de: 'Abstecher ins Fürstentum', en: 'A trip to the principality' },
    text: { de: 'Durchs Rheintal nach Vaduz, weiter nach Feldkirch und über Bregenz zurück – vier Länder, ein Tag.',
            en: 'Through the Rhine valley to Vaduz, on to Feldkirch and back via Bregenz – four countries, one day.' },
    start: '08:30',
    waypoints: [{ stop: 'stgallen' }, { stop: 'vaduz', stay: 120 }, { stop: 'feldkirch', stay: 60 }, { stop: 'bregenz', stay: 60 }, { stop: 'stgallen' }],
  },
];
