import { Suspense } from "react";
import { buttonClass } from "@take-my-word/brand";
import { format, type Dictionary } from "@/lib/i18n.ts";
import { windowsDownloadUrl } from "@/lib/links.ts";
import { latestDesktopVersion } from "@/lib/server/release.ts";

function WindowsIcon() {
  return (
    <svg viewBox="0 0 16 16" aria-hidden="true" fill="currentColor">
      <path d="M0 2.3 6.5 1.4v6.2H0zm7.3-1L16 0v7.6H7.3zM0 8.4h6.5v6.2L0 13.7zm7.3 0H16V16l-8.7-1.2z" />
    </svg>
  );
}

async function VersionNote({ t }: { t: Dictionary["landing"] }) {
  const version = await latestDesktopVersion();
  return (
    <span data-testid="download-version">
      {version === null ? t.versionless : format(t.version, { version })}
    </span>
  );
}

export function Download({
  t,
  align = "start",
}: {
  t: Dictionary["landing"];
  align?: "start" | "center";
}) {
  return (
    <div className="download" data-align={align}>
      <a className={buttonClass({ size: "lg" })} href={windowsDownloadUrl}>
        <WindowsIcon />
        {t.download}
      </a>
      <p className="download-note">
        <Suspense fallback={<span>{t.versionless}</span>}>
          <VersionNote t={t} />
        </Suspense>
        <span className="download-soon">{t.soon}</span>
      </p>
    </div>
  );
}
