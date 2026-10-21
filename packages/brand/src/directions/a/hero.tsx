import { copy } from "../copy.ts";
import { Demo } from "../demo.tsx";
import { Header, WindowsIcon } from "../header.tsx";
import { Mark, Wordmark } from "./mark.tsx";

export function Hero() {
  return (
    <div className="a-page">
      <Header
        brand={
          <>
            <Mark size={30} className="a-brand-mark" />
            <Wordmark />
          </>
        }
      />
      <main className="a-hero">
        <div className="a-copy">
          <p className="a-kicker">
            <span>{copy.kicker}</span>
          </p>
          <h1 className="a-title">
            {copy.headline[0]} <em>{copy.headline[1]}</em>
          </h1>
          <p className="a-lead">{copy.lead}</p>
          <div className="a-actions">
            <a className="d-button" href="#top">
              <WindowsIcon />
              {copy.download}
            </a>
            <a className="a-link" href="#top">
              {copy.signIn}
            </a>
          </div>
          <p className="a-meta">
            {copy.version}. {copy.soon}
          </p>
        </div>
        <div className="a-stage">
          <Demo />
          <p className="a-tagline">{copy.tagline}</p>
        </div>
      </main>
    </div>
  );
}
