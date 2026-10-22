import { mkdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { Resvg } from "@resvg/resvg-js";
import {
  appDesigns,
  appIconSvg,
  png,
  traySizes,
  trayStates,
  traySvg,
  trayDesigns,
} from "./desktop-icons.ts";

const out = process.argv[2];
if (out === undefined) {
  process.stderr.write("usage: node scripts/icon-sheet.ts <output-dir>\n");
  process.exit(2);
}
mkdirSync(out, { recursive: true });

const backdrops = [
  { name: "Light taskbar", fill: "#f3f3f3", text: "#1a1a1a" },
  { name: "Dark taskbar", fill: "#202020", text: "#f3f3f3" },
];

const dataUri = (data: Buffer) => `data:image/png;base64,${data.toString("base64")}`;
const image = (data: Buffer, x: number, y: number, size: number) =>
  `<image href="${dataUri(data)}" x="${String(x)}" y="${String(y)}" width="${String(size)}" height="${String(size)}" image-rendering="optimizeSpeed"/>`;
const label = (value: string, x: number, y: number, fill: string, size = 14) =>
  `<text x="${String(x)}" y="${String(y)}" font-family="Lato, sans-serif" font-size="${String(size)}" fill="${fill}">${value}</text>`;

interface Row {
  name: string;
  frame: (px: number) => Buffer;
}

function sheet(title: string, sizes: readonly number[], zooms: [number, number][], rows: Row[]) {
  const labelWidth = 150;
  const cell = 56;
  const zoomCell = 120;
  const rowHeight = 120;
  const panelWidth = labelWidth + sizes.length * cell + zooms.length * zoomCell + 24;
  const top = 72;
  const width = panelWidth * backdrops.length;
  const height = top + rows.length * rowHeight + 16;
  const panels = backdrops.map((backdrop, panel) => {
    const left = panel * panelWidth;
    const header = [
      label(`${title} · ${backdrop.name}`, left + 16, 28, backdrop.text, 16),
      ...sizes.map((px, index) =>
        label(`${String(px)} px`, left + labelWidth + index * cell, 56, backdrop.text, 12),
      ),
      ...zooms.map(([px, zoom], index) =>
        label(
          `${String(px)} px ×${String(zoom)}`,
          left + labelWidth + sizes.length * cell + index * zoomCell,
          56,
          backdrop.text,
          12,
        ),
      ),
    ];
    const body = rows.flatMap((row, index) => {
      const y = top + index * rowHeight;
      return [
        label(row.name, left + 16, y + rowHeight / 2, backdrop.text),
        ...sizes.map((px, column) =>
          image(row.frame(px), left + labelWidth + column * cell, y + (rowHeight - px) / 2, px),
        ),
        ...zooms.map(([px, zoom], column) =>
          image(
            row.frame(px),
            left + labelWidth + sizes.length * cell + column * zoomCell,
            y + (rowHeight - px * zoom) / 2,
            px * zoom,
          ),
        ),
      ];
    });
    return [
      `<rect x="${String(left)}" width="${String(panelWidth)}" height="${String(height)}" fill="${backdrop.fill}"/>`,
      ...header,
      ...body,
    ].join("");
  });
  const source = `<svg xmlns="http://www.w3.org/2000/svg" width="${String(width)}" height="${String(height)}" viewBox="0 0 ${String(width)} ${String(height)}">${panels.join("")}</svg>`;
  return new Resvg(source, {
    font: { loadSystemFonts: true, defaultFontFamily: "Lato" },
  })
    .render()
    .asPng();
}

const write = (name: string, data: Buffer) => {
  writeFileSync(join(out, name), data);
  process.stdout.write(`wrote ${name}\n`);
};

for (const design of trayDesigns) {
  const rows = [false, true].flatMap((dev) =>
    trayStates.map((state) => ({
      name: `${state}${dev ? " · dev" : ""}`,
      frame: (px: number) => png(traySvg(design, state, px, dev), px),
    })),
  );
  for (const row of rows) {
    for (const px of traySizes) {
      write(`tray-${design}-${row.name.replace(" · ", "-")}-${String(px)}.png`, row.frame(px));
    }
  }
  write(
    `tray-sheet-${design}.png`,
    sheet(
      `Tray, ${design}`,
      traySizes,
      [
        [16, 6],
        [24, 4],
      ],
      rows,
    ),
  );
}

write(
  "app-icon-sheet.png",
  sheet(
    "App icon",
    [16, 24, 32, 48],
    [
      [16, 6],
      [96, 1],
    ],
    appDesigns.flatMap((design) =>
      [false, true].map((dev) => ({
        name: `${design}${dev ? " · dev" : ""}`,
        frame: (px: number) => png(appIconSvg(design, px, dev), px),
      })),
    ),
  ),
);
