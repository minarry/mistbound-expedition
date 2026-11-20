/** Art direction for the five campaign terrain types. Distances are scene units. */
export const terrainStyles = {
  hills:     { grass: '#a4ae83', ridge: '#718974', bank: '#cfbc8f', riverWidth: .60, relief: 1.9, houses: 12, trees: 260 },
  village:   { grass: '#abb685', ridge: '#849576', bank: '#cfbd90', riverWidth: .52, relief: 1.4, houses: 22, trees: 205 },
  mountain:  { grass: '#819783', ridge: '#526c67', bank: '#c2bba1', riverWidth: .44, relief: 3.4, houses: 6, trees: 375 },
  river:     { grass: '#90ae93', ridge: '#708f83', bank: '#dac8a1', riverWidth: .99, relief: 1.3, houses: 11, trees: 245 },
  town:      { grass: '#b0ad84', ridge: '#939378', bank: '#cdbb97', riverWidth: .56, relief: 1.1, houses: 32, trees: 140 },
};

export function sceneryStyle(terrain: string) {
  return Object.hasOwn(terrainStyles, terrain)
    ? terrainStyles[terrain as keyof typeof terrainStyles]
    : terrainStyles.hills;
}

export type SceneWeather = 'clear' | 'fog' | 'rain' | 'frost' | 'dusk';

export const skies = {
  clear: { zenith: '#92b5b4', horizon: '#e1d5b3', haze: '#d4d5bf', fog: .020, sun: '#ffe0aa', direct: 2.12, sky: '#eef2db', ambient: 1.65 },
  fog:   { zenith: '#9caca6', horizon: '#d2d5c7', haze: '#acb8b0', fog: .037, sun: '#ebdfbe', direct: 1.30, sky: '#dce6df', ambient: 1.45 },
  rain:  { zenith: '#677e81', horizon: '#a4b3aa', haze: '#96a7a4', fog: .036, sun: '#d4ded7', direct: .75, sky: '#c5d7db', ambient: 1.22 },
  frost: { zenith: '#91a2af', horizon: '#c6cfce', haze: '#b9c7c9', fog: .034, sun: '#d4dce2', direct: 1.10, sky: '#d5e7ec', ambient: 1.30 },
  dusk:  { zenith: '#475c63', horizon: '#b0a48a', haze: '#94998b', fog: .030, sun: '#e4b789', direct: 1.03, sky: '#a6c1c4', ambient: 1.05 },
} satisfies Record<SceneWeather, object>;

// Keyed by the existing script's weather and lighting notes.
export const chapterWeather: Record<string, SceneWeather> = {
  s01:'rain', s02:'dusk', s03:'rain', s04:'fog', s05:'fog',
  s06:'fog', s07:'clear', s08:'clear', s09:'rain', s10:'fog',
  s11:'frost', s12:'frost', s13:'fog', s14:'clear', s15:'clear',
  s16:'clear', s17:'dusk', s18:'rain', s19:'rain', s20:'dusk',
};
