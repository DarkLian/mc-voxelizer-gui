/** Extract the filename stem from a full path (cross-platform). */
export function stemFromPath(filePath: string): string {
  const name = filePath.replace(/\\/g, "/").split("/").pop() ?? filePath;
  const dot = name.lastIndexOf(".");
  return dot > 0 ? name.slice(0, dot) : name;
}

/** Truncate a long path for display, keeping the filename visible. */
export function shortenPath(filePath: string, maxLen = 45): string {
  if (filePath.length <= maxLen) return filePath;
  const norm = filePath.replace(/\\/g, "/");
  const parts = norm.split("/");
  const name = parts.pop() ?? "";
  const dir = parts.join("/");
  if (name.length >= maxLen - 5) return "…/" + name;
  const remaining = maxLen - name.length - 4;
  return dir.slice(0, remaining) + "…/" + name;
}

/** Sanitise a string to be a valid Minecraft model name (no spaces, etc.) */
export function sanitiseModelName(raw: string): string {
  return raw
    .toLowerCase()
    .replace(/\s+/g, "_")
    .replace(/[^a-z0-9_\-]/g, "")
    .slice(0, 64);
}

/** Validate a Minecraft namespace / mod ID. */
export function isValidModId(id: string): boolean {
  return /^[a-z0-9_\-]{1,32}$/.test(id);
}

/** Validate a Minecraft model name. */
export function isValidModelName(name: string): boolean {
  return /^[a-z0-9_\-]{1,64}$/.test(name);
}

/**
 * Build the effective output directory for a file.
 * If `perFileDir` is set it wins; otherwise fall back to the global default.
 */
export function resolveOutputDir(
  perFileDir: string | null,
  sourcePath: string,
  mode: "fixed" | "alongside",
  globalDefault: string
): string {
  if (perFileDir) return perFileDir;
  if (mode === "alongside") {
    const norm = sourcePath.replace(/\\/g, "/");
    const dir = norm.substring(0, norm.lastIndexOf("/"));
    return dir || ".";
  }
  return globalDefault;
}
