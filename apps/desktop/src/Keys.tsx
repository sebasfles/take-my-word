import { type MessageId, t } from "./i18n.ts";

const translated: Record<string, MessageId> = { Shift: "key.shift" };

export function Keys({ keys }: { keys: string[] }) {
  return (
    <span className="keys">
      {keys.map((key, index) => {
        const id = translated[key];
        return (
          <span key={key} className="keys-item">
            {index > 0 && <span className="keys-plus">+</span>}
            <kbd>{id ? t(id) : key}</kbd>
          </span>
        );
      })}
    </span>
  );
}
