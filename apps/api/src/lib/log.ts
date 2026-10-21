export type LogFields = Record<string, string | number | boolean | undefined>;

export interface Logger {
  info(message: string, fields?: LogFields): void;
  error(message: string, fields?: LogFields): void;
  child(fields: LogFields): Logger;
}

export type LineWriter = (line: string) => void;

export const stdout: LineWriter = (line) => {
  process.stdout.write(`${line}\n`);
};

export function createLogger(base: LogFields = {}, write: LineWriter = stdout): Logger {
  const emit = (level: string, message: string, fields: LogFields = {}) => {
    write(JSON.stringify({ level, message, ...base, ...fields }));
  };
  return {
    info: (message, fields) => {
      emit("info", message, fields);
    },
    error: (message, fields) => {
      emit("error", message, fields);
    },
    child: (fields) => createLogger({ ...base, ...fields }, write),
  };
}
