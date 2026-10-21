import { readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { parseArgs } from "node:util";

export const tagPrefix = "desktop-v";

const files = {
  packageJson: "package.json",
  cargoToml: "src-tauri/Cargo.toml",
  cargoLock: "src-tauri/Cargo.lock",
} as const;

type VersionFile = keyof typeof files;
export type DesktopVersions = Record<VersionFile, string>;

const patterns: Record<Exclude<VersionFile, "packageJson">, RegExp> = {
  cargoToml: /^(\[package\]\nname = "take-my-word"\nversion = ")([^"]+)(")/m,
  cargoLock: /^(\[\[package\]\]\nname = "take-my-word"\nversion = ")([^"]+)(")/m,
};

export function isVersion(value: string): boolean {
  return /^(0|[1-9]\d*)\.(0|[1-9]\d*)\.(0|[1-9]\d*)(-[0-9A-Za-z-]+(\.[0-9A-Za-z-]+)*)?$/.test(
    value,
  );
}

function read(desktopDir: string, file: VersionFile): string {
  return readFileSync(join(desktopDir, files[file]), "utf8");
}

function readPackageJson(desktopDir: string): Record<string, unknown> {
  return JSON.parse(read(desktopDir, "packageJson")) as Record<string, unknown>;
}

function cargoVersion(desktopDir: string, file: "cargoToml" | "cargoLock"): string {
  const found = patterns[file].exec(read(desktopDir, file));
  if (!found?.[2]) throw new Error(`no take-my-word version found in ${files[file]}`);
  return found[2];
}

export function readVersions(desktopDir: string): DesktopVersions {
  const { version } = readPackageJson(desktopDir);
  if (typeof version !== "string") throw new Error(`${files.packageJson} has no version`);
  return {
    packageJson: version,
    cargoToml: cargoVersion(desktopDir, "cargoToml"),
    cargoLock: cargoVersion(desktopDir, "cargoLock"),
  };
}

export function writeVersion(desktopDir: string, version: string): string[] {
  if (!isVersion(version)) throw new Error(`${version} is not a semantic version`);
  readVersions(desktopDir);
  const packageJson = { ...readPackageJson(desktopDir), version };
  writeFileSync(join(desktopDir, files.packageJson), `${JSON.stringify(packageJson, null, 2)}\n`);
  for (const file of ["cargoToml", "cargoLock"] as const) {
    const text = read(desktopDir, file);
    writeFileSync(join(desktopDir, files[file]), text.replace(patterns[file], `$1${version}$3`));
  }
  return Object.values(files);
}

export function versionProblem(versions: DesktopVersions, tag?: string): string | undefined {
  const { packageJson, cargoToml, cargoLock } = versions;
  if (packageJson !== cargoToml || cargoToml !== cargoLock) {
    return `desktop versions differ: package.json ${packageJson}, Cargo.toml ${cargoToml}, Cargo.lock ${cargoLock}`;
  }
  if (!isVersion(cargoToml)) return `${cargoToml} is not a semantic version`;
  if (tag !== undefined && tag !== `${tagPrefix}${cargoToml}`) {
    return `tag ${tag} does not match the desktop version ${cargoToml}`;
  }
  return undefined;
}

if (import.meta.main) {
  const { values } = parseArgs({ options: { tag: { type: "string" } } });
  const desktopDir = join(import.meta.dirname, "..");
  const versions = readVersions(desktopDir);
  const problem = versionProblem(versions, values.tag);
  if (problem) {
    console.error(problem);
    process.exit(1);
  }
  console.log(`desktop version ${versions.cargoToml}`);
}
