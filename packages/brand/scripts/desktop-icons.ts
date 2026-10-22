import { Resvg } from "@resvg/resvg-js";
import { glyph, glyphInTile, glyphSmall, smallUpTo, tile } from "../src/mark-geometry.ts";
import { tokens } from "../src/tokens.ts";

export const trayStates = ["idle", "recording", "attention"] as const;
export type TrayState = (typeof trayStates)[number];
export const traySizes = [16, 20, 24, 32] as const;
export const appIconSizes = [16, 20, 24, 32, 40, 48, 64, 128, 256] as const;

const light = tokens.light.colors;
const dark = tokens.dark.colors;
const paper = light.onAccent;
const ink = light.text;
const quiet = tokens.neutral["600"];
const badge = dark.warning;
const devMark = dark.info;

function bar(x: number, center: number, width: number, height: number): string {
  const r = width / 2;
  return `M${String(x)} ${String(center - height / 2 + r)}a${String(r)} ${String(r)} 0 0 1 ${String(width)} 0V${String(center + height / 2 - r)}a${String(r)} ${String(r)} 0 0 1 ${String(-width)} 0Z`;
}

const listening = [bar(12, 32, 8, 24), bar(28, 32, 8, 40), bar(44, 32, 8, 16)].join("");

const svg = (body: string) =>
  `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 64 64">${body}</svg>`;

const roundedTile = (fill: string) =>
  `<rect width="64" height="64" rx="${String(tile.radius)}" fill="${fill}"/>`;

const attentionBadge = (px: number) =>
  [
    `<circle cx="48" cy="48" r="16" fill="${ink}"/>`,
    `<circle cx="48" cy="48" r="12" fill="${badge}"/>`,
    px >= 24 ? `<path d="M46 39h4v11h-4zM46 53h4v4h-4z" fill="${ink}"/>` : "",
  ].join("");

const devCorner = `<path d="M36 0H49A15 15 0 0 1 64 15V28Z" fill="${devMark}"/>`;

export function traySvg(state: TrayState, px: number, dev = false): string {
  const shape = state === "recording" ? listening : glyphSmall;
  const parts = [
    roundedTile(state === "attention" ? quiet : light.accent),
    `<path d="${shape}" fill="${paper}"/>`,
  ];
  if (state === "attention") parts.push(attentionBadge(px));
  if (dev) parts.push(devCorner);
  return svg(parts.join(""));
}

export function appIconSvg(px: number, dev = false): string {
  const parts = [
    roundedTile(light.accent),
    px <= smallUpTo
      ? `<path d="${glyphSmall}" fill="${paper}"/>`
      : `<path d="${glyph}" transform="${glyphInTile}" fill="${paper}"/>`,
  ];
  if (dev) parts.push(devCorner);
  return svg(parts.join(""));
}

export const png = (source: string, px: number) =>
  new Resvg(source, { fitTo: { mode: "width", value: px } }).render().asPng();

export function ico(images: { size: number; data: Buffer }[]): Buffer {
  const header = Buffer.alloc(6 + 16 * images.length);
  header.writeUInt16LE(0, 0);
  header.writeUInt16LE(1, 2);
  header.writeUInt16LE(images.length, 4);
  let offset = header.length;
  images.forEach(({ size: px, data }, index) => {
    const entry = 6 + index * 16;
    header.writeUInt8(px >= 256 ? 0 : px, entry);
    header.writeUInt8(px >= 256 ? 0 : px, entry + 1);
    header.writeUInt16LE(1, entry + 4);
    header.writeUInt16LE(32, entry + 6);
    header.writeUInt32LE(data.length, entry + 8);
    header.writeUInt32LE(offset, entry + 12);
    offset += data.length;
  });
  return Buffer.concat([header, ...images.map((image) => image.data)]);
}
