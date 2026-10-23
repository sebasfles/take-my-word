import { createInterface } from "node:readline/promises";
import { Writable } from "node:stream";

export class Prompt {
  private muted = false;
  private readonly lines = createInterface({
    input: process.stdin,
    output: new Writable({
      write: (chunk: Buffer, _encoding, done) => {
        if (!this.muted) process.stdout.write(chunk);
        done();
      },
    }),
    terminal: process.stdin.isTTY,
  });

  async ask(question: string, fallback?: string): Promise<string> {
    const shown = fallback === undefined || fallback === "" ? "" : ` [${fallback}]`;
    const answer = (await this.lines.question(`${question}${shown}: `)).trim();
    return answer === "" ? (fallback ?? "") : answer;
  }

  async confirm(question: string, fallback: boolean): Promise<boolean> {
    const answer = (await this.ask(`${question} (y/n)`, fallback ? "y" : "n")).toLowerCase();
    return answer === "y" || answer === "yes" || answer === "s" || answer === "si";
  }

  async secret(question: string): Promise<string> {
    process.stdout.write(`${question}: `);
    this.muted = true;
    try {
      return (await this.lines.question("")).trim();
    } finally {
      this.muted = false;
      process.stdout.write("\n");
    }
  }

  close(): void {
    this.lines.close();
  }
}
