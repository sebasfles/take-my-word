import { copy } from "../copy.ts";
import { Demo } from "../demo.tsx";
import { Header, WindowsIcon } from "../header.tsx";
import { Mark, Wordmark } from "./mark.tsx";

export function Hero() {
  return (
    <div className="c-page">
      <Header
        brand={
          <>
            <Mark size={30} className="c-brand-mark" />
            <Wordmark />
          </>
        }
      />
      <main className="c-hero">
        <h1 className="c-title">
          {copy.headline[0]}
          <br />
          Queda <em>escrito.</em>
        </h1>
        <div className="c-side">
          <p className="c-tagline">{copy.tagline}</p>
          <p className="c-lead">{copy.lead}</p>
          <div className="c-actions">
            <a className="d-button" href="#top">
              <WindowsIcon />
              {copy.download}
            </a>
            <p className="c-meta">
              {copy.version}. {copy.soon}
            </p>
          </div>
        </div>
        <div className="c-stage">
          <Demo bars={9} />
        </div>
      </main>
    </div>
  );
}
