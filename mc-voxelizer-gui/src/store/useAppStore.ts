import { create } from "zustand";
import { persist } from "zustand/middleware";
import type {
  FileEntry,
  FileSettings,
  FileStatus,
  LogLine,
  Preferences,
} from "@/types";
import { DEFAULT_PREFERENCES, QUALITY_RESOLUTION } from "@/types";
import { stemFromPath } from "@/utils/pathUtils";

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
  addFiles: (paths: string[]) => string[]; // returns added IDs
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
  addLogLine: (id: string, line: Omit<LogLine, "id">) => void;
  finishFile: (
    id: string,
    success: boolean,
    outputJson?: string,
    outputPng?: string
  ) => void;
  setElapsed: (id: string, ms: number) => void;
  advanceQueue: () => string | null; // returns next file ID or null

  // ── Log drawer actions ─────────────────────────────────────────────────────
  openLogDrawer: (fileId?: string) => void;
  closeLogDrawer: () => void;
  clearLogBadge: () => void;
  incrementLogBadge: () => void;

  // ── Preferences actions ────────────────────────────────────────────────────
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
        const { files, preferences } = get();
        const existing = new Set(files.map((f) => f.sourcePath));
        const added: string[] = [];

        const newFiles: FileEntry[] = [];
        for (const p of paths) {
          if (existing.has(p)) continue;
          const id = uid();
          newFiles.push({
            id,
            sourcePath: p,
            status: "idle",
            settings: makeDefaultSettings(p, preferences),
            progress: 0,
            elapsedMs: 0,
            pid: null,
            log: [],
            errorSummary: null,
            outputJson: null,
            outputPng: null,
          });
          added.push(id);
        }

        set((s) => ({
          files: [...s.files, ...newFiles],
          // Auto-select first added file if nothing is selected
          selectedIds:
            s.selectedIds.size === 0 && added.length > 0
              ? new Set([added[0]])
              : s.selectedIds,
        }));

        return added;
      },

      removeFiles: (ids) => {
        const idSet = new Set(ids);
        set((s) => ({
          files: s.files.filter((f) => !idSet.has(f.id)),
          conversionQueue: s.conversionQueue.filter((id) => !idSet.has(id)),
          selectedIds: new Set([...s.selectedIds].filter((id) => !idSet.has(id))),
        }));
      },

      clearDone: () => {
        set((s) => ({
          files: s.files.filter(
            (f) => f.status !== "done" && f.status !== "cancelled"
          ),
          selectedIds: new Set(
            [...s.selectedIds].filter((id) => {
              const f = s.files.find((x) => x.id === id);
              return f && f.status !== "done" && f.status !== "cancelled";
            })
          ),
        }));
      },

      reorderFile: (id, toIndex) => {
        set((s) => {
          const idx = s.files.findIndex((f) => f.id === id);
          if (idx === -1) return {};
          const arr = [...s.files];
          const [item] = arr.splice(idx, 1);
          arr.splice(toIndex, 0, item);
          return { files: arr };
        });
      },

      // ── Settings ────────────────────────────────────────────────────────────

      updateSettings: (id, patch) => {
        set((s) => ({
          files: s.files.map((f) =>
            f.id === id ? { ...f, settings: { ...f.settings, ...patch } } : f
          ),
        }));
      },

      applySettingsToIds: (ids, patch) => {
        const idSet = new Set(ids);
        set((s) => ({
          files: s.files.map((f) =>
            idSet.has(f.id)
              ? { ...f, settings: { ...f.settings, ...patch } }
              : f
          ),
        }));
      },

      // ── Selection ───────────────────────────────────────────────────────────

      selectFile: (id, mode) => {
        set((s) => {
          if (mode === "single") return { selectedIds: new Set([id]) };
          if (mode === "add") {
            const next = new Set(s.selectedIds);
            if (next.has(id)) next.delete(id);
            else next.add(id);
            return { selectedIds: next };
          }
          // Range: select from last selected to clicked
          const ids = s.files.map((f) => f.id);
          const last = [...s.selectedIds].pop();
          const a = last ? ids.indexOf(last) : 0;
          const b = ids.indexOf(id);
          const lo = Math.min(a, b);
          const hi = Math.max(a, b);
          return { selectedIds: new Set(ids.slice(lo, hi + 1)) };
        });
      },

      selectAll: () => {
        set((s) => ({ selectedIds: new Set(s.files.map((f) => f.id)) }));
      },

      deselectAll: () => {
        set({ selectedIds: new Set() });
      },

      // ── Conversion queue ────────────────────────────────────────────────────

      enqueueSelected: () => {
        const { files, selectedIds } = get();
        const toQueue = files
          .filter(
            (f) =>
              selectedIds.has(f.id) &&
              (f.status === "idle" ||
                f.status === "error" ||
                f.status === "cancelled")
          )
          .map((f) => f.id);
        get().enqueueIds(toQueue);
      },

      enqueueIds: (ids) => {
        const idSet = new Set(ids);
        set((s) => {
          const alreadyQueued = new Set(s.conversionQueue);
          const toAdd = ids.filter((id) => !alreadyQueued.has(id));
          return {
            files: s.files.map((f) =>
              idSet.has(f.id) &&
              (f.status === "idle" ||
                f.status === "error" ||
                f.status === "cancelled")
                ? {
                    ...f,
                    status: "queued" as FileStatus,
                    progress: 0,
                    log: [],
                    errorSummary: null,
                    outputJson: null,
                    outputPng: null,
                  }
                : f
            ),
            conversionQueue: [...s.conversionQueue, ...toAdd],
          };
        });
      },

      cancelAll: () => {
        set((s) => ({
          conversionQueue: [],
          activeId: s.activeId, // leave active — caller kills the process
          files: s.files.map((f) =>
            f.status === "queued"
              ? { ...f, status: "cancelled" as FileStatus }
              : f
          ),
        }));
      },

      cancelFile: (id) => {
        set((s) => ({
          conversionQueue: s.conversionQueue.filter((x) => x !== id),
          files: s.files.map((f) =>
            f.id === id && (f.status === "queued" || f.status === "running")
              ? { ...f, status: "cancelled" as FileStatus, pid: null }
              : f
          ),
        }));
      },

      // ── Runtime updates ─────────────────────────────────────────────────────

      setStatus: (id, status) => {
        set((s) => ({
          files: s.files.map((f) => (f.id === id ? { ...f, status } : f)),
        }));
      },

      setPid: (id, pid) => {
        set((s) => ({
          files: s.files.map((f) => (f.id === id ? { ...f, pid } : f)),
          activeId: pid !== null ? id : s.activeId,
        }));
      },

      setProgress: (id, progress) => {
        set((s) => ({
          files: s.files.map((f) => (f.id === id ? { ...f, progress } : f)),
        }));
      },

      setElapsed: (id, ms) => {
        set((s) => ({
          files: s.files.map((f) => (f.id === id ? { ...f, elapsedMs: ms } : f)),
        }));
      },

      addLogLine: (id, line) => {
        const entry: LogLine = { ...line, id: logId() };
        const isVisible = !get().logDrawerOpen;
        set((s) => ({
          files: s.files.map((f) =>
            f.id === id ? { ...f, log: [...f.log, entry] } : f
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
        const { conversionQueue, activeId } = get();
        if (activeId !== null) return null; // already running
        if (conversionQueue.length === 0) return null;
        const [next, ...rest] = conversionQueue;
        set({ conversionQueue: rest, activeId: next });
        return next;
      },

      // ── Log drawer ──────────────────────────────────────────────────────────

      openLogDrawer: (fileId) => {
        set({
          logDrawerOpen: true,
          logFilterFileId: fileId ?? "all",
          logBadgeCount: 0,
        });
      },

      closeLogDrawer: () => set({ logDrawerOpen: false }),

      clearLogBadge: () => set({ logBadgeCount: 0 }),

      incrementLogBadge: () =>
        set((s) => ({ logBadgeCount: s.logBadgeCount + 1 })),

      // ── Preferences ─────────────────────────────────────────────────────────

      openPrefs: () => set({ prefsOpen: true }),
      closePrefs: () => set({ prefsOpen: false }),

      updatePreferences: (patch) => {
        set((s) => ({ preferences: { ...s.preferences, ...patch } }));
      },

      resetPreferences: () => set({ preferences: DEFAULT_PREFERENCES }),
    }),
    {
      name: "mc-voxelizer-prefs",
      // Only persist preferences — file queue is session-only
      partialize: (s) => ({ preferences: s.preferences }),
    }
  )
);

// ── Derived selectors ─────────────────────────────────────────────────────────

export const selectSelectedFiles = (s: AppStore) =>
  s.files.filter((f) => s.selectedIds.has(f.id));

export const selectRunningFile = (s: AppStore) =>
  s.files.find((f) => f.id === s.activeId) ?? null;

export const selectQueueStats = (s: AppStore) => ({
  total: s.files.length,
  done: s.files.filter((f) => f.status === "done").length,
  running: s.files.filter((f) => f.status === "running").length,
  queued: s.files.filter((f) => f.status === "queued").length,
  error: s.files.filter((f) => f.status === "error").length,
  idle: s.files.filter((f) => f.status === "idle").length,
});

export const selectEstimatedAtlasSize = (quality: number, density: number) => {
  const gridRes = QUALITY_RESOLUTION[quality] ?? 32;
  return gridRes * (density || 8);
};
