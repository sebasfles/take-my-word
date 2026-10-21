export function galleryEnabled(env: Record<string, string | undefined>): boolean {
  return env.TMW_GALLERY === "1";
}
