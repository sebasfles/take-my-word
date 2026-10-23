import { AppIcon, Mark, Waveform } from "@take-my-word/brand";
import { language, t } from "../../i18n.ts";
import { Keys } from "../../Keys.tsx";
import { changesFrom } from "../../wordDiff.ts";

export function WelcomeVisual() {
  return (
    <div className="visual visual-brand" aria-hidden="true">
      <Mark size={96} className="visual-mark" />
      <Waveform demo bars={9} className="visual-wave" />
    </div>
  );
}

export function BrandVisual() {
  return (
    <div className="visual visual-brand" aria-hidden="true">
      <Mark size={96} className="visual-mark" />
      <p className="visual-tagline">{t("brand.tagline")}</p>
    </div>
  );
}

export function LiveMeter({ levels, label }: { levels: readonly number[]; label: string }) {
  return (
    <div className="visual visual-meter" role="img" aria-label={label}>
      <Waveform levels={levels} />
    </div>
  );
}

export function KeysVisual({ hotkey }: { hotkey: string[] | null }) {
  const keys = hotkey ?? [];
  return (
    <div className="visual visual-keys" aria-hidden="true">
      <div className="keycap-demo">
        <span className="keycap-row keycap-hold">
          {keys.map((key) => (
            <span key={key} className="keycap">
              {key}
            </span>
          ))}
        </span>
        <span className="keycap-caption">{t("hotkey.hold.title")}</span>
      </div>
      <div className="keycap-demo">
        <span className="keycap-row keycap-tap">
          {keys.map((key) => (
            <span key={key} className="keycap">
              {key}
            </span>
          ))}
        </span>
        <span className="keycap-caption">
          {t("hotkey.handsFree.title")} <span className="gesture-times">×2</span>
        </span>
      </div>
      <p className="visual-hint">
        <Keys keys={["Esc"]} /> {t("hotkey.escape")}
      </p>
    </div>
  );
}

export function TrayVisual() {
  return (
    <div className="visual visual-tray" aria-hidden="true">
      <div className="tray-menu">
        <span>{t("tray.addWord")}</span>
        <span>{t("tray.settings")}</span>
        <span>{t("tray.signOut")}</span>
        <span className="tray-menu-rule" />
        <span>{t("tray.quit")}</span>
      </div>
      <div className="taskbar">
        <span className="taskbar-chevron">^</span>
        <span className="taskbar-icon">
          <AppIcon size={28} />
        </span>
        <span className="taskbar-clock">10:42</span>
      </div>
    </div>
  );
}

export function ContextVisual() {
  const without = t("context.example.withoutText");
  return (
    <figure className="visual visual-context">
      <figcaption className="visual-context-title">{t("context.example.title")}</figcaption>
      <div className="context-example">
        <span className="context-example-label">{t("context.example.without")}</span>
        <p lang={language()}>{without}</p>
      </div>
      <div className="context-example" data-with="">
        <span className="context-example-label">{t("context.example.with")}</span>
        <p lang={language()}>
          {changesFrom(without, t("context.example.withText")).map((piece, index) =>
            piece.changed ? (
              <mark key={index} className="example-change">
                {piece.text}
              </mark>
            ) : (
              piece.text
            ),
          )}
        </p>
      </div>
    </figure>
  );
}
