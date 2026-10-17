const paletteEntries = [
  ["blue", "rgb(26, 106, 255)"],
  ["orange", "rgb(255, 116, 51)"],
  ["red", "rgb(255, 77, 77)"],
  ["yellow", "rgb(255, 212, 51)"],
  ["purple", "rgb(136, 77, 255)"],
  ["green", "rgb(133, 255, 102)"],
  ["pink", "rgb(235, 138, 255)"],
  ["teal", "rgb(68, 224, 241)"],
  ["black", "rgb(34, 34, 34)"],
  ["darkGray", "rgb(90, 90, 90)"],
  ["lightGray", "rgb(179, 179, 179)"],
  ["white", "rgb(255, 255, 255)"],
  ["primary", "hsl(260, 100%, 80%)"],
] as const;

type PaletteName = (typeof paletteEntries)[number][0];
const colors = Object.fromEntries(paletteEntries) as Record<PaletteName, string>;

export type Colors = typeof colors;
export type Color = keyof Colors;
export const colorOptions = paletteEntries.map(([name]) => name) as Color[];

export default colors;
