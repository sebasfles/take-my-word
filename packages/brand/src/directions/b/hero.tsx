import { copy } from "../copy.ts";
import { Demo } from "../demo.tsx";
import { Header, WindowsIcon } from "../header.tsx";
import { ColorMark, Wordmark } from "./mark.tsx";

export function Hero() {
  return (
    <div className="b-page">
      <Header
        brand={
          <>
            <ColorMark size={34} />
            <Wordmark />
          </>
        }
      />
      <main className="b-hero">
        <p className="b-kicker">{copy.kicker}</p>
        <h1 className="b-title">
          <span>{copy.headline[0]}</span> <span className="b-title-accent">{copy.headline[1]}</span>
        </h1>
        <p className="b-lead">{copy.lead}</p>
        <div className="b-actions">
          <a className="d-button" href="#top">
            <WindowsIcon />
            {copy.download}
          </a>
          <p className="b-meta">
            {copy.version}
            <br />
            {copy.soon}
          </p>
        </div>
        <div className="b-slab">
          <Demo bars={7} />
        </div>
        <p className="b-tagline">{copy.tagline}</p>
      </main>
    </div>
  );
}
