// ── Core domain types ─────────────────────────────────────────────────────────

export type FileStatus =
    | "idle"
    | "queued"
    | "running"
    | "paused"
    | "done"
    | "error"
    | "cancelled";

export type LogLevel = "info" | "warning" | "error" | "debug";

export interface LogLine {
    id: string;
    timestamp: Date;
    level: LogLevel;
    text: string;
}

export interface FileSettings {
    /** null = use global preference default */
    outputDir: string | null;
    modelName: string;
    modId: string;
    /** 1–7 matching the CLI --quality flag */
    quality: number;
    /** pixel density per voxel face; 0 = auto (resolved by the binary) */
    density: number;
    solidFill: boolean;
}

export interface FileEntry {
    id: string;
    sourcePath: string;
    status: FileStatus;
    settings: FileSettings;
    /** 0–100 estimated from log stage markers */
    progress: number;
    /** wall-clock milliseconds elapsed since conversion started */
    elapsedMs: number;
    /** OS PID of the running child process, null when not running */
    pid: number | null;
    log: LogLine[];
    /** Short description of the last error line, shown on hover */
    errorSummary: string | null;
    outputJson: string | null;
    outputPng: string | null;
}

// ── Preferences ───────────────────────────────────────────────────────────────

export interface Preferences {
    defaultOutputDir: string;
    /** "fixed" = use defaultOutputDir; "alongside" = next to source file */
    defaultOutputMode: "fixed" | "alongside";
    defaultModId: string;
    defaultQuality: number;
    /** 0 = auto */
    defaultDensity: number;
    defaultSolidFill: boolean;
    theme: "dark" | "light" | "system";
    showToastOnComplete: boolean;
    playSoundOnComplete: boolean;
    /** Explicit path override; null = auto-detect bundled sidecar */
    binaryPath: string | null;
}

export const DEFAULT_PREFERENCES: Preferences = {
    defaultOutputDir: "./output",
    defaultOutputMode: "fixed",
    defaultModId: "darkaddons",
    defaultQuality: 3,
    defaultDensity: 0,
    defaultSolidFill: false,
    theme: "dark",
    showToastOnComplete: true,
    playSoundOnComplete: false,
    binaryPath: null,
};

// ── UI state ──────────────────────────────────────────────────────────────────

export type BatchApplyScope =
    | "all"
    | "selected"
    | "quality"
    | "density"
    | "modId"
    | "outputDir";

// ── Quality resolution lookup (mirrors C++ qualityToResolution) ───────────────

export const QUALITY_RESOLUTION: Record<number, number> = {
    1: 16,
    2: 24,
    3: 32,
    4: 48,
    5: 64,
    6: 96,
    7: 128,
};

export const QUALITY_LABELS: Record<number, string> = {
    1: "16³ — fastest",
    2: "24³",
    3: "32³ — recommended",
    4: "48³",
    5: "64³ — good detail",
    6: "96³ — face detail",
    7: "128³ — maximum",
};
