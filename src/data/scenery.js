// Points along the shores of Lake Constance and the Rhine; transit stops near them count as "lake view".
export const LAKESIDE = [
  // Rhine and Untersee
  [47.690, 8.750], [47.661, 8.858], [47.646, 8.913], [47.667, 8.983], [47.671, 9.017], [47.673, 9.050],
  [47.670, 9.085], [47.664, 9.133], [47.687, 9.059], [47.715, 9.070], [47.736, 8.970],
  // Swiss shore of the Obersee
  [47.649, 9.179], [47.638, 9.208], [47.633, 9.233], [47.610, 9.260], [47.604, 9.288], [47.596, 9.316],
  [47.585, 9.339], [47.565, 9.379], [47.543, 9.378], [47.516, 9.433], [47.500, 9.440], [47.494, 9.462],
  [47.478, 9.495], [47.481, 9.540], [47.489, 9.548],
  // Austrian shore
  [47.489, 9.690], [47.503, 9.742], [47.531, 9.749],
  // German shore and Überlinger See
  [47.544, 9.681], [47.570, 9.630], [47.574, 9.611], [47.594, 9.598], [47.599, 9.542], [47.630, 9.510],
  [47.650, 9.480], [47.663, 9.430], [47.666, 9.366], [47.675, 9.318], [47.694, 9.271], [47.724, 9.227],
  [47.752, 9.190], [47.766, 9.159], [47.797, 9.098], [47.818, 9.060], [47.659, 9.177], [47.680, 9.200],
  [47.705, 9.195],
];

// Boat piers used as optional via points when searching scenic alternatives with real timetables.
export const SCENIC_HUBS = [
  { name: 'Romanshorn', lat: 47.563, lon: 9.381 },
  { name: 'Friedrichshafen', lat: 47.650, lon: 9.480 },
  { name: 'Konstanz', lat: 47.660, lon: 9.180 },
  { name: 'Meersburg', lat: 47.694, lon: 9.272 },
  { name: 'Lindau', lat: 47.544, lon: 9.683 },
  { name: 'Bregenz', lat: 47.506, lon: 9.743 },
  { name: 'Überlingen', lat: 47.765, lon: 9.162 },
  { name: 'Stein am Rhein', lat: 47.660, lon: 8.861 },
  { name: 'Schaffhausen', lat: 47.694, lon: 8.637 },
  { name: 'Rorschach', lat: 47.479, lon: 9.493 },
];
