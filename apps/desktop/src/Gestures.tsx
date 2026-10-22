import { t } from "./i18n.ts";
import { Keys } from "./Keys.tsx";

export function Gestures({ hotkey }: { hotkey: string[] | null }) {
  const keys = hotkey && <Keys keys={hotkey} />;
  return (
    <div className="gestures">
      <section className="gesture">
        <h2>{t("hotkey.hold.title")}</h2>
        <p className="gesture-keys">{keys}</p>
        <p>{t("hotkey.hold.body")}</p>
      </section>
      <section className="gesture">
        <h2>{t("hotkey.handsFree.title")}</h2>
        <p className="gesture-keys">
          {keys}
          <span className="gesture-times">×2</span>
        </p>
        <p>{t("hotkey.handsFree.body")}</p>
      </section>
    </div>
  );
}
