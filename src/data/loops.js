// Lake loops in clockwise order (north shore eastwards, south shore westwards).
// Each entry: [stopId, km along the Bodensee-Radweg to the next entry, cyclable].
// The distances are rough estimates; the last entry connects back to the first.
export const LOOPS = {
  obersee: [
    ['konstanz', 12, false], // car ferry Konstanz-Staad – Meersburg
    ['meersburg', 18, true],
    ['fnHafen', 9, true],
    ['langenargen', 14, true],
    ['lindauInsel', 10, true],
    ['bregenz', 22, true],
    ['rorschach', 7, true],
    ['arbon', 7, true],
    ['romanshorn', 20, true],
    ['kreuzlingen', 2, true],
  ],
  full: [
    ['konstanz', 7, true],
    ['mainau', 35, true], // around the Bodanrück via Bodman
    ['ueberlingen', 9, true],
    ['unteruhldingen', 7, true],
    ['meersburg', 18, true],
    ['fnHafen', 9, true],
    ['langenargen', 14, true],
    ['lindauInsel', 10, true],
    ['bregenz', 22, true],
    ['rorschach', 7, true],
    ['arbon', 7, true],
    ['romanshorn', 20, true],
    ['kreuzlingen', 20, true],
    ['steckborn', 12, true],
    ['steinamrhein', 28, true], // over the Höri peninsula
    ['radolfzell', 12, true],
    ['reichenau', 10, true],
  ],
};

// Segments up to this length are cycled in the "some bike" mode.
export const SHORT_BIKE_KM = 15;
export const MAX_BIKE_KM_PER_DAY = 80;
export const NEXT_DAY_START = '09:00';
