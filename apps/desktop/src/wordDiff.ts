export interface Piece {
  text: string;
  changed: boolean;
}

const normalize = (word: string) => word.replace(/[’‘]/g, "'").replace(/[“”«»]/g, '"');

const words = (text: string) => text.split(/\s+/).filter((word) => word !== "");

function kept(before: readonly string[], after: readonly string[]): boolean[] {
  const columns = after.length + 1;
  const table = new Array<number>((before.length + 1) * columns).fill(0);
  const cell = (i: number, j: number) => table[i * columns + j] ?? 0;
  for (let i = before.length - 1; i >= 0; i -= 1) {
    for (let j = after.length - 1; j >= 0; j -= 1) {
      table[i * columns + j] =
        before[i] === after[j] ? cell(i + 1, j + 1) + 1 : Math.max(cell(i + 1, j), cell(i, j + 1));
    }
  }
  const same = new Array<boolean>(after.length).fill(false);
  let i = 0;
  let j = 0;
  while (i < before.length && j < after.length) {
    if (before[i] === after[j]) {
      same[j] = true;
      i += 1;
      j += 1;
    } else if (cell(i + 1, j) >= cell(i, j + 1)) {
      i += 1;
    } else {
      j += 1;
    }
  }
  return same;
}

export function changesFrom(said: string, written: string): Piece[] {
  const after = words(written);
  const same = kept(words(said).map(normalize), after.map(normalize));
  const pieces: Piece[] = [];
  after.forEach((word, index) => {
    const changed = !same[index];
    const previous = pieces.at(-1);
    if (previous && previous.changed === changed) {
      previous.text += ` ${word}`;
    } else {
      if (previous) previous.text += " ";
      pieces.push({ text: word, changed });
    }
  });
  return pieces;
}
