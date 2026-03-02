import {create} from "zustand";
import {persist} from "zustand/middleware";
import type {FileEntry, FileSettings, FileStatus, LogLine, Preferences,} from "@/types";
import {DEFAULT_PREFERENCES} from "@/types";
import {stemFromPath} from "@/utils/pathUtils";

// ── Helper ────────────────────────────────────────────────────────────────────

function uid(): string {
    return crypto.randomUUID();
}

function logId(): string {
    return Math.random().toString(36).slice(2, 10);
}

function makeDefaultSettings(
    sourcePath: string,
    prefs: Preferences
): FileSettings {
    return {
        outputDir: null,
        modelName: stemFromPath(sourcePath),
        modId: prefs.defaultModId,
        quality: prefs.defaultQuality,
        density: prefs.defaultDensity,
        solidFill: prefs.defaultSolidFill,
    };
}

// ── Store interface ───────────────────────────────────────────────────────────

interface AppStore {
    // ── File queue ─────────────────────────────────────────────────────────────
    files: FileEntry[];
    /** Ordered list of IDs waiting to be converted */
    conversionQueue: string[];
    /** ID of the file currently being converted */
    activeId: string | null;

    // ── Selection ──────────────────────────────────────────────────────────────
    selectedIds: Set<string>;

    // ── UI state ───────────────────────────────────────────────────────────────
    logDrawerOpen: boolean;
    logFilterFileId: string | "all";
    prefsOpen: boolean;
    logBadgeCount: number;

    // ── Preferences (persisted) ────────────────────────────────────────────────
    preferences: Preferences;

    // ── File queue actions ─────────────────────────────────────────────────────
    addFiles: (paths: string[]) => string[];
    removeFiles: (ids: string[]) => void;
    clearDone: () => void;
    reorderFile: (id: string, toIndex: number) => void;

    // ── Settings actions ───────────────────────────────────────────────────────
    updateSettings: (id: string, patch: Partial<FileSettings>) => void;
    applySettingsToIds: (ids: string[], patch: Partial<FileSettings>) => void;

    // ── Selection actions ──────────────────────────────────────────────────────
    selectFile: (id: string, mode: "single" | "add" | "range") => void;
    selectAll: () => void;
    deselectAll: () => void;

    // ── Conversion actions ─────────────────────────────────────────────────────
    enqueueSelected: () => void;
    enqueueIds: (ids: string[]) => void;
    cancelAll: () => void;
    cancelFile: (id: string) => void;

    // ── Runtime update actions (called by the conversion hook) ─────────────────
    setStatus: (id: string, status: FileStatus) => void;
    setPid: (id: string, pid: number | null) => void;
    setProgress: (id: string, progress: number) => void;
    setElapsed: (id: string, ms: number) => void;
    addLogLine: (id: string, line: Omit<LogLine, "id">) => void;
    finishFile: (
        id: string,
        success: boolean,
        outputJson?: string,
        outputPng?: string
    ) => void;
    advanceQueue: () => string | null;

    /** Force-clears a stuck activeId and marks the file as error. Use when the
     *  child process dies without firing close/error (e.g. permission failures). */
    forceResetActive: () => void;

    // ── Log drawer ─────────────────────────────────────────────────────────────
    openLogDrawer: (fileId?: string) => void;
    closeLogDrawer: () => void;
    clearLogBadge: () => void;
    incrementLogBadge: () => void;

    // ── Preferences ────────────────────────────────────────────────────────────
    openPrefs: () => void;
    closePrefs: () => void;
    updatePreferences: (patch: Partial<Preferences>) => void;
    resetPreferences: () => void;
}

// ── Store implementation ──────────────────────────────────────────────────────

export const useAppStore = create<AppStore>()(
    persist(
        (set, get) => ({
            files: [],
            conversionQueue: [],
            activeId: null,
            selectedIds: new Set(),
            logDrawerOpen: false,
            logFilterFileId: "all",
            prefsOpen: false,
            logBadgeCount: 0,
            preferences: DEFAULT_PREFERENCES,

            // ── File queue ──────────────────────────────────────────────────────────

            addFiles: (paths) => {
                const prefs = get().preferences;
                const existingPaths = new Set(get().files.map((f) => f.sourcePath));
                const newFiles: FileEntry[] = [];

                for (const p of paths) {
                    if (existingPaths.has(p)) continue;
                    newFiles.push({
                        id: uid(),
                        sourcePath: p,
                        status: "idle",
                        settings: makeDefaultSettings(p, prefs),
                        progress: 0,
                        elapsedMs: 0,
                        pid: null,
                        log: [],
                        errorSummary: null,
                        outputJson: null,
                        outputPng: null,
                    });
                    existingPaths.add(p);
                }

                if (newFiles.length > 0) {
                    set((s) => ({files: [...s.files, ...newFiles]}));
                }
                return newFiles.map((f) => f.id);
            },

            removeFiles: (ids) => {
                const idSet = new Set(ids);
                set((s) => ({
                    files: s.files.filter((f) => !idSet.has(f.id)),
                    conversionQueue: s.conversionQueue.filter((id) => !idSet.has(id)),
                    selectedIds: new Set([...s.selectedIds].filter((id) => !idSet.has(id))),
                    activeId: idSet.has(s.activeId ?? "") ? null : s.activeId,
                }));
            },

            clearDone: () => {
                set((s) => ({
                    files: s.files.filter(
                        (f) => f.status !== "done" && f.status !== "cancelled"
                    ),
                    selectedIds: new Set(
                        [...s.selectedIds].filter((id) =>
                            s.files.find(
                                (f) =>
                                    f.id === id &&
                                    f.status !== "done" &&
                                    f.status !== "cancelled"
                            )
                        )
                    ),
                }));
            },

            reorderFile: (id, toIndex) => {
                const files = [...get().files];
                const from = files.findIndex((f) => f.id === id);
                if (from === -1) return;
                const [item] = files.splice(from, 1);
                files.splice(toIndex, 0, item);
                set({files});
            },

            // ── Settings ────────────────────────────────────────────────────────────

            updateSettings: (id, patch) => {
                set((s) => ({
                    files: s.files.map((f) =>
                        f.id === id ? {...f, settings: {...f.settings, ...patch}} : f
                    ),
                }));
            },

            applySettingsToIds: (ids, patch) => {
                const idSet = new Set(ids);
                set((s) => ({
                    files: s.files.map((f) =>
                        idSet.has(f.id)
                            ? {...f, settings: {...f.settings, ...patch}}
                            : f
                    ),
                }));
            },

            // ── Selection ───────────────────────────────────────────────────────────

            selectFile: (id, mode) => {
                const {files, selectedIds} = get();
                if (mode === "single") {
                    set({selectedIds: new Set([id])});
                } else if (mode === "add") {
                    const next = new Set(selectedIds);
                    if (next.has(id)) next.delete(id);
                    else next.add(id);
                    set({selectedIds: next});
                } else if (mode === "range") {
                    const ids = files.map((f) => f.id);
                    const anchor = [...selectedIds][0] ?? ids[0];
                    const anchorIdx = ids.indexOf(anchor);
                    const targetIdx = ids.indexOf(id);
                    const [lo, hi] = [
                        Math.min(anchorIdx, targetIdx),
                        Math.max(anchorIdx, targetIdx),
                    ];
                    set({selectedIds: new Set(ids.slice(lo, hi + 1))});
                }
            },

            selectAll: () => {
                set((s) => ({selectedIds: new Set(s.files.map((f) => f.id))}));
            },

            deselectAll: () => set({selectedIds: new Set()}),

            // ── Conversion queue ────────────────────────────────────────────────────

            enqueueSelected: () => {
                const {selectedIds, files} = get();
                const ids = files
                    .filter((f) => selectedIds.has(f.id) && f.status === "idle")
                    .map((f) => f.id);
                if (ids.length === 0) return;
                const idSet = new Set(ids);
                set((s) => ({
                    conversionQueue: [
                        ...s.conversionQueue,
                        ...ids.filter((id) => !s.conversionQueue.includes(id)),
                    ],
                    files: s.files.map((f) =>
                        idSet.has(f.id) ? {...f, status: "queued" as FileStatus} : f
                    ),
                }));
            },

            enqueueIds: (ids) => {
                const {files} = get();
                const validIds = ids.filter((id) => {
                    const f = files.find((x) => x.id === id);
                    return f && (f.status === "idle" || f.status === "error" || f.status === "cancelled");
                });
                if (validIds.length === 0) return;
                const idSet = new Set(validIds);
                set((s) => ({
                    conversionQueue: [
                        ...s.conversionQueue,
                        ...validIds.filter((id) => !s.conversionQueue.includes(id)),
                    ],
                    files: s.files.map((f) =>
                        idSet.has(f.id) ? {
                            ...f,
                            status: "queued" as FileStatus,
                            log: [],
                            progress: 0,
                            errorSummary: null
                        } : f
                    ),
                }));
            },

            cancelAll: () => {
                set((s) => ({
                    conversionQueue: [],
                    activeId: null,
                    files: s.files.map((f) =>
                        f.status === "queued" || f.status === "running"
                            ? {...f, status: "cancelled" as FileStatus}
                            : f
                    ),
                }));
            },

            cancelFile: (id) => {
                set((s) => ({
                    conversionQueue: s.conversionQueue.filter((x) => x !== id),
                    files: s.files.map((f) =>
                        f.id === id && (f.status === "queued" || f.status === "running")
                            ? {...f, status: "cancelled" as FileStatus, pid: null}
                            : f
                    ),
                }));
            },

            // ── Runtime updates ─────────────────────────────────────────────────────

            setStatus: (id, status) => {
                set((s) => ({
                    files: s.files.map((f) => (f.id === id ? {...f, status} : f)),
                }));
            },

            setPid: (id, pid) => {
                set((s) => ({
                    files: s.files.map((f) => (f.id === id ? {...f, pid} : f)),
                    activeId: pid !== null ? id : s.activeId,
                }));
            },

            setProgress: (id, progress) => {
                set((s) => ({
                    files: s.files.map((f) => (f.id === id ? {...f, progress} : f)),
                }));
            },

            setElapsed: (id, ms) => {
                set((s) => ({
                    files: s.files.map((f) => (f.id === id ? {...f, elapsedMs: ms} : f)),
                }));
            },

            addLogLine: (id, line) => {
                const entry: LogLine = {...line, id: logId()};
                const isVisible = !get().logDrawerOpen;
                set((s) => ({
                    files: s.files.map((f) =>
                        f.id === id ? {...f, log: [...f.log, entry]} : f
                    ),
                    logBadgeCount:
                        isVisible &&
                        (entry.level === "warning" || entry.level === "error")
                            ? s.logBadgeCount + 1
                            : s.logBadgeCount,
                }));
            },

            finishFile: (id, success, outputJson, outputPng) => {
                set((s) => ({
                    activeId: s.activeId === id ? null : s.activeId,
                    files: s.files.map((f) =>
                        f.id === id
                            ? {
                                ...f,
                                status: (success ? "done" : "error") as FileStatus,
                                pid: null,
                                progress: success ? 100 : f.progress,
                                outputJson: outputJson ?? null,
                                outputPng: outputPng ?? null,
                                errorSummary: success
                                    ? null
                                    : f.log
                                    .filter((l) => l.level === "error")
                                    .pop()?.text ?? "Unknown error",
                            }
                            : f
                    ),
                }));
            },

            advanceQueue: () => {
                const {conversionQueue, activeId} = get();
                if (activeId !== null) return null;
                if (conversionQueue.length === 0) return null;
                const [next, ...rest] = conversionQueue;
                set({conversionQueue: rest, activeId: next});
                return next;
            },

            forceResetActive: () => {
                const {activeId, files} = get();
                if (!activeId) return;
                const file = files.find((f) => f.id === activeId);
                set((s) => ({
                    activeId: null,
                    conversionQueue: [],
                    files: s.files.map((f) =>
                        f.id === activeId
                            ? {
                                ...f,
                                status: "error" as FileStatus,
                                pid: null,
                                errorSummary: file?.errorSummary ?? "Conversion interrupted",
                            }
                            : f.status === "queued"
                                ? {...f, status: "idle" as FileStatus}
                                : f
                    ),
                }));
            },

            // ── Log drawer ──────────────────────────────────────────────────────────

            openLogDrawer: (fileId) => {
                set({
                    logDrawerOpen: true,
                    logFilterFileId: fileId ?? "all",
                    logBadgeCount: 0,
                });
            },

            closeLogDrawer: () => set({logDrawerOpen: false}),

            clearLogBadge: () => set({logBadgeCount: 0}),

            incrementLogBadge: () =>
                set((s) => ({logBadgeCount: s.logBadgeCount + 1})),

            // ── Preferences ─────────────────────────────────────────────────────────

            openPrefs: () => set({prefsOpen: true}),
            closePrefs: () => set({prefsOpen: false}),

            updatePreferences: (patch) => {
                set((s) => ({preferences: {...s.preferences, ...patch}}));
            },

            resetPreferences: () => set({preferences: DEFAULT_PREFERENCES}),
        }),
        {
            name: "mc-voxelizer-prefs",
            partialize: (s) => ({preferences: s.preferences}),
        }
    )
);

// ── Derived selectors ─────────────────────────────────────────────────────────

export const selectSelectedFiles = (s: AppStore) =>
    s.files.filter((f) => s.selectedIds.has(f.id));

export const selectRunningFile = (s: AppStore) =>
    s.files.find((f) => f.id === s.activeId) ?? null;

export interface QueueStats {
    total: number;
    idle: number;
    queued: number;
    running: number;
    paused: number;
    done: number;
    error: number;
    cancelled: number;
}

export const selectQueueStats = (s: AppStore): QueueStats => {
    const stats: QueueStats = {
        total: s.files.length,
        idle: 0,
        queued: 0,
        running: 0,
        paused: 0,
        done: 0,
        error: 0,
        cancelled: 0,
    };
    for (const f of s.files) stats[f.status]++;
    return stats;
};
