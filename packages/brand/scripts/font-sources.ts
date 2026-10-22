import * as fontkit from "fontkit";
import subsetFont from "subset-font";

const gstatic = "https://fonts.gstatic.com/s";

export const characters = [
  ...Array.from({ length: 0x7e - 0x20 + 1 }, (_, index) => String.fromCharCode(0x20 + index)),
  ...Array.from("¡«»¿ÁÉÍÑÓÚÜáéíñóúüÀÈÒàèòÇç·–‘’“”…€°ºª "),
].join("");

export type Axes = Record<string, number | { min: number; max: number }>;

export interface Face {
  family: string;
  file: string;
  url: string;
  style: "normal" | "italic";
  weight: [number, number];
  axes: Axes;
  metricsAt: Record<string, number>;
  fallback: "serif" | "sans";
}

export const faces = {
  fraunces: {
    family: "Fraunces",
    file: "fraunces.woff2",
    url: `${gstatic}/fraunces/v38/6NUV8FyLNQOQZAnv9ZwIlOk.woff2`,
    style: "normal",
    weight: [400, 640],
    axes: { wght: { min: 400, max: 640 }, SOFT: 60, WONK: 0, opsz: 72 },
    metricsAt: { wght: 560 },
    fallback: "serif",
  },
  frauncesItalic: {
    family: "Fraunces",
    file: "fraunces-italic.woff2",
    url: `${gstatic}/fraunces/v38/6NUT8FyLNQOQZAnv9ZwNpOskzA.woff2`,
    style: "italic",
    weight: [400, 640],
    axes: { wght: { min: 400, max: 640 }, SOFT: 60, WONK: 0, opsz: 72 },
    metricsAt: { wght: 440 },
    fallback: "serif",
  },
  instrumentSans: {
    family: "Instrument Sans",
    file: "instrument-sans.woff2",
    url: `${gstatic}/instrumentsans/v4/pxicypc9vsFDm051Uf6KVwgkfoSbT2lB.woff2`,
    style: "normal",
    weight: [400, 700],
    axes: { wght: { min: 400, max: 700 }, wdth: 100 },
    metricsAt: { wght: 400 },
    fallback: "sans",
  },
} satisfies Record<string, Face>;

const downloads = new Map<string, Buffer>();

export async function download(face: Face): Promise<Buffer> {
  const cached = downloads.get(face.url);
  if (cached !== undefined) return cached;
  const response = await fetch(face.url);
  if (!response.ok) throw new Error(`${face.url}: ${String(response.status)}`);
  const source = Buffer.from(await response.arrayBuffer());
  downloads.set(face.url, source);
  return source;
}

export async function staticInstance(
  face: Face,
  at: Record<string, number>,
): Promise<fontkit.Font> {
  const pinned = await subsetFont(await download(face), characters, {
    targetFormat: "truetype",
    variationAxes: { ...face.axes, ...at },
  });
  return fontkit.create(pinned) as fontkit.Font;
}

export async function webSubset(face: Face): Promise<Buffer> {
  return subsetFont(await download(face), characters, {
    targetFormat: "woff2",
    variationAxes: face.axes,
  });
}
