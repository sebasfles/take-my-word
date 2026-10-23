const repositoryPattern = /^[A-Za-z0-9-]+\/[A-Za-z0-9._-]+$/;

export interface ReleaseLinks {
  releases: string;
  windowsInstaller: string;
  latestManifest: string;
}

export function releaseLinks(repository: string | undefined): ReleaseLinks {
  if (repository === undefined || !repositoryPattern.test(repository)) {
    throw new Error(
      `RELEASES_REPOSITORY must name the GitHub repository whose releases hold the desktop app, as owner/name; got ${JSON.stringify(repository)}`,
    );
  }
  const releases = `https://github.com/${repository}/releases`;
  return {
    releases,
    windowsInstaller: `${releases}/latest/download/take-my-word-windows-x64-setup.exe`,
    latestManifest: `${releases}/latest/download/latest.json`,
  };
}

export const links = releaseLinks(process.env.RELEASES_REPOSITORY);
