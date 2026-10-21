import { Waveform } from "../waveform.tsx";
import { copy } from "./copy.ts";

export function Demo({ bars = 5 }: { bars?: number }) {
  const demo = copy.demo;
  return (
    <figure className="demo" aria-label={demo.label}>
      <div className="demo-window">
        <div className="demo-titlebar">
          <span className="demo-dots" aria-hidden="true">
            <span />
            <span />
            <span />
          </span>
          <span className="demo-app">{demo.app}</span>
          <span className="demo-channel">{demo.channel}</span>
        </div>
        <div className="demo-said">
          <span className="demo-label">{demo.said}</span>
          <p className="demo-raw">
            {demo.chunks.map((chunk, index) => (
              <span key={index} className="demo-chunk" data-chunk={index + 1}>
                {chunk.map((segment, at) => (
                  <span key={at} className={segment.kind ? `demo-${segment.kind}` : undefined}>
                    {segment.text}
                  </span>
                ))}
              </span>
            ))}
          </p>
        </div>
        <div className="demo-compose">
          <span className="demo-label">{demo.written}</span>
          <p className="demo-clean">
            {demo.clean}
            <span className="demo-caret" aria-hidden="true" />
          </p>
        </div>
      </div>
      <div className="demo-controls" aria-hidden="true">
        <span className="demo-keys">
          {demo.keys.map((key) => (
            <kbd key={key} className="demo-key">
              {key}
            </kbd>
          ))}
        </span>
        <span className="demo-pill">
          <Waveform demo bars={bars} />
          <span className="demo-status">
            <span className="demo-listening">{demo.listening}</span>
            <span className="demo-cleaning">{demo.cleaning}</span>
          </span>
        </span>
      </div>
    </figure>
  );
}
