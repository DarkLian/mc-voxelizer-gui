import {AlertTriangle, Pause, Play, Plus, RefreshCw, Settings, Square, Terminal,} from "lucide-react";
import {open} from "@tauri-apps/plugin-dialog";
import {selectRunningFile, useAppStore} from "@/store/useAppStore";

export interface AppConversionControls {
    killActive: () => Promise<void>;
    pauseActive: () => Promise<void>;
    resumeActive: () => Promise<void>;
    forceReset: () => Promise<void>;
}

interface Props {
    controls: AppConversionControls;
}

export function Toolbar({controls}: Props) {
    const {killActive, pauseActive, resumeActive, forceReset} = controls;

    const runningFile = useAppStore(selectRunningFile);
    const activeId = useAppStore((s) => s.activeId);
    const selectedIds = useAppStore((s) => s.selectedIds);
    const logBadge = useAppStore((s) => s.logBadgeCount);
    const files = useAppStore((s) => s.files);
    const {
        addFiles, enqueueSelected, cancelAll, openLogDrawer, openPrefs,
        enqueueIds,
    } = useAppStore.getState();

    const isPaused = runningFile?.status === "paused";
    const isRunning = runningFile?.status === "running";
    const anyActive = isRunning || isPaused;

    // Detect stuck state: activeId is set but child is gone (no PID on running file)
    const isStuck = activeId !== null && runningFile?.status === "running" && !runningFile?.pid;

    // Files that can be queued (selected + idle/error/cancelled)
    const queueableCount = [...selectedIds].filter((id) => {
        const f = files.find((x) => x.id === id);
        return f && (f.status === "idle" || f.status === "error" || f.status === "cancelled");
    }).length;

    // Error files for "retry" button
    const errorIds = files.filter((f) => f.status === "error").map((f) => f.id);

    async function handleAddFiles() {
        const result = await open({
            multiple: true,
            filters: [{name: "3D Models", extensions: ["obj", "gltf", "glb"]}],
        });
        if (!result) return;
        const paths = Array.isArray(result) ? result : [result];
        addFiles(paths);
    }

    async function handleCancelAll() {
        if (!anyActive) return;
        const confirmed = await window.__confirmCancelAll?.();
        if (!confirmed) return;
        await killActive();
        cancelAll();
    }

    return (
        <header className="flex items-center gap-2 px-3 py-2.5 border-b border-border
                       bg-panel flex-shrink-0">

            {/* Add files */}
            <button className="btn-ghost text-sm" onClick={handleAddFiles} title="Add files (Ctrl+O)">
                <Plus size={15}/>
                Add Files
            </button>

            <div className="w-px h-5 bg-border mx-1"/>

            {/* Convert selected */}
            <button
                className="btn-primary text-sm"
                disabled={queueableCount === 0}
                onClick={enqueueSelected}
                title="Convert selected files (Ctrl+Enter)"
            >
                <Play size={14}/>
                Convert
                {queueableCount > 0 && (
                    <span className="ml-0.5 bg-base/20 rounded px-1">{queueableCount}</span>
                )}
            </button>

            {/* Pause / Resume */}
            {anyActive && (
                <button
                    className="btn-ghost text-sm"
                    onClick={isPaused ? resumeActive : pauseActive}
                    title={isPaused ? "Resume conversion" : "Pause conversion"}
                >
                    {isPaused ? <Play size={14}/> : <Pause size={14}/>}
                    {isPaused ? "Resume" : "Pause"}
                </button>
            )}

            {/* Cancel all */}
            {anyActive && (
                <button
                    className="btn-danger text-sm"
                    onClick={handleCancelAll}
                    title="Cancel all conversions"
                >
                    <Square size={14}/>
                    Cancel
                </button>
            )}

            {/* Force reset stuck conversion */}
            {isStuck && (
                <button
                    className="btn-ghost text-sm text-warning border-warning/20 hover:bg-warning/10"
                    onClick={forceReset}
                    title="The conversion appears stuck. Click to force-skip and continue the queue."
                >
                    <AlertTriangle size={14}/>
                    Force Skip
                </button>
            )}

            {/* Retry failed */}
            {!anyActive && errorIds.length > 0 && (
                <button
                    className="btn-ghost text-sm text-warning border-warning/20 hover:bg-warning/10"
                    onClick={() => enqueueIds(errorIds)}
                    title="Retry all failed files"
                >
                    <RefreshCw size={14}/>
                    Retry ({errorIds.length})
                </button>
            )}

            {/* Spacer */}
            <div className="flex-1"/>

            {/* Active file indicator */}
            {runningFile && (
                <div className="flex items-center gap-2 text-sm text-text-muted bg-card
                        rounded px-2 py-1 border border-border max-w-xs truncate">
                    <span className="spinner text-running"/>
                    <span className="truncate">
                        {runningFile.settings.modelName} — {runningFile.progress}%
                    </span>
                </div>
            )}

            <div className="w-px h-5 bg-border mx-1"/>

            {/* Logs */}
            <button
                className="btn-icon relative"
                onClick={() => openLogDrawer()}
                title="View logs (Ctrl+L)"
            >
                <Terminal size={16}/>
                {logBadge > 0 && (
                    <span className="absolute -top-1 -right-1 w-4 h-4 rounded-full bg-error
                           text-[9px] text-white flex items-center justify-center font-bold">
                        {logBadge > 9 ? "9+" : logBadge}
                    </span>
                )}
            </button>

            {/* Preferences */}
            <button className="btn-icon" onClick={openPrefs} title="Preferences (Ctrl+,)">
                <Settings size={16}/>
            </button>
        </header>
    );
}

// ── Type for App to pass controls down ───────────────────────────────────────

declare global {
    interface Window {
        __confirmCancelAll?: () => Promise<boolean>;
    }
}
