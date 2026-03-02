import type { LogLevel } from "@/types";

/**
 * Detect the log level from a raw stdout/stderr line.
 * The C++ binary uses prefixes like [ObjLoader], [Voxelizer], etc.
 */
export function detectLogLevel(line: string): LogLevel {
  const lower = line.toLowerCase();
  if (
    lower.includes("error") ||
    lower.includes("fatal") ||
    lower.includes("failed")
  )
    return "error";
  if (lower.includes("warning") || lower.includes("warn")) return "warning";
  if (lower.startsWith("  ") || lower.startsWith("\t")) return "debug";
  return "info";
}

/**
 * Pipeline stage → progress percentage.
 * Each stage maps to a range; we return the value when that stage is first seen.
 *
 * Stages detected from C++ stdout:
 *   [ObjLoader] / [GltfLoader]  → Loading           → 10%
 *   [Density]                   → Density resolved   → 15%
 *   [Normalizer]                → Normalising        → 20%
 *   [Voxelizer] Quality …       → Voxelising start   → 25%
 *   [Voxelizer] Grid:           → Voxelising done    → 55%
 *   [GreedyMesher]              → Meshing            → 65%
 *   [TextureAtlas] Layout …     → Atlas layout       → 70%
 *   [McModel] MC elements       → Baking done        → 80%
 *   [TextureAtlas] Wrote atlas  → PNG written        → 88%
 *   [McModel] Wrote N elements  → JSON written       → 96%
 *   Done!                       → Complete           → 100%
 */
export function progressFromLine(line: string): number | null {
  if (line.includes("[ObjLoader]") || line.includes("[GltfLoader]")) return 10;
  if (line.includes("[Density]")) return 15;
  if (line.includes("[Normalizer]")) return 20;
  if (line.includes("[Voxelizer] Quality")) return 25;
  if (line.includes("[Voxelizer] Processing")) return 30;
  if (line.includes("[Voxelizer] Grid:")) return 55;
  if (line.includes("[GreedyMesher]")) return 65;
  if (line.includes("[TextureAtlas] Layout")) return 70;
  if (line.includes("[McModel] MC elements")) return 80;
  if (line.includes("[TextureAtlas] Wrote atlas")) return 88;
  if (line.includes("[McModel] Wrote")) return 96;
  if (line.includes("Done!")) return 100;
  return null;
}

/** Returns true when the process has finished (success or failure). */
export function isTerminalLine(line: string): boolean {
  return (
    line.includes("Done!") ||
    line.includes("Fatal error:") ||
    line.includes("Press Enter to exit")
  );
}

/** True when the process is asking for Enter — we must reply with "\n". */
export function isPausePrompt(line: string): boolean {
  return line.includes("Press Enter to exit");
}
