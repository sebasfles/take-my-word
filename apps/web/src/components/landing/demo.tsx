import { OverlayPill } from "@take-my-word/brand";
import type { DemoScript, Dictionary } from "@/lib/i18n.ts";

export function Demo({ script, t }: { script: DemoScript; t: Dictionary["landing"]["demo"] }) {
  return (
    <figure className="demo" aria-label={t.label} lang={script.lang}>
      <div className="demo-sheet">
        <div className="demo-window">
          <div className="demo-titlebar">
            <span className="demo-dots" aria-hidden="true">
              <span />
              <span />
              <span />
            </span>
            <span className="demo-app">{script.app}</span>
            <span className="demo-channel">{script.channel}</span>
          </div>
          <div className="demo-said">
            <span className="demo-label">{t.said}</span>
            <p className="demo-raw">
              {script.spoken.map((chunk, index) => (
                <span key={index} className="demo-chunk" data-chunk={index + 1}>
                  {chunk.map((segment, at) => (
                    <span
                      key={at}
                      className={segment.kind === undefined ? undefined : `demo-${segment.kind}`}
                    >
                      {segment.text}
                    </span>
                  ))}
                </span>
              ))}
            </p>
          </div>
          <div className="demo-compose">
            <span className="demo-label">{t.written}</span>
            <p className="demo-clean">
              {script.written}
              <span className="demo-caret" aria-hidden="true" />
            </p>
          </div>
        </div>
      </div>
      <div className="demo-controls" aria-hidden="true">
        <span className="demo-keys">
          {t.keys.map((key) => (
            <kbd key={key} className="demo-key">
              {key}
            </kbd>
          ))}
        </span>
        <OverlayPill
          className="demo-pill"
          state="listening"
          bars={5}
          label={
            <span className="demo-status">
              <span className="demo-listening">{t.listening}</span>
              <span className="demo-cleaning">{t.cleaning}</span>
              <span className="demo-pasted">{t.pasted}</span>
            </span>
          }
        />
      </div>
    </figure>
  );
}

export function StaticExample({
  script,
  t,
  label,
}: {
  script: DemoScript;
  t: Dictionary["landing"]["demo"];
  label: string;
}) {
  return (
    <figure className="example" lang={script.lang}>
      <figcaption className="example-label">{label}</figcaption>
      <p className="example-said">
        <span className="visually-hidden">{t.said}: </span>
        {script.spoken
          .flat()
          .map((segment, index) =>
            segment.kind === undefined ? (
              <span key={index}>{segment.text}</span>
            ) : (
              <del key={index}>{segment.text}</del>
            ),
          )}
      </p>
      <p className="example-written">
        <span className="visually-hidden">{t.written}: </span>
        {script.written}
      </p>
    </figure>
  );
}
