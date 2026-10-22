function bar(x: number, center: number, width: number, height: number): string {
  const r = width / 2;
  const top = center - height / 2;
  const bottom = center + height / 2;
  return `M${String(x)} ${String(top + r)}a${String(r)} ${String(r)} 0 0 1 ${String(width)} 0V${String(bottom - r)}a${String(r)} ${String(r)} 0 0 1 ${String(-width)} 0Z`;
}

export const glyph = [
  "M6 39C6 26.5 11.4 16.6 23 11.2C18.6 16.4 16.3 21.6 16.6 28.1A10.5 10.5 0 1 1 6 39Z",
  bar(32, 31, 7, 22),
  bar(42.5, 31, 7, 40),
  bar(53, 31, 7, 14),
].join("");

export const glyphSmall = [
  "M8 40C8 27 14 17 27 12C22 17 19.5 22.5 19.8 29.03A11 11 0 1 1 8 40Z",
  bar(36, 32, 8, 40),
  bar(48, 32, 8, 24),
].join("");

export const tile = { size: 64, radius: 15 };
export const glyphInTile = "translate(5.5 4.5) scale(0.83)";
export const smallUpTo = 48;
