import {selectQueueStats, selectRunningFile, useAppStore} from "@/store/useAppStore";

export function StatusBar() {
    const stats = useAppStore(selectQueueStats);
    const running = useAppStore(selectRunningFile);

    const parts: string[] = [];
    if (stats.total > 0) parts.push(`${stats.total} file${stats.total !== 1 ? "s" : ""}`);
    if (stats.done > 0) parts.push(`${stats.done} done`);
    if (stats.running > 0) parts.push(`${stats.running} running`);
    if (stats.queued > 0) parts.push(`${stats.queued} queued`);
    if (stats.error > 0) parts.push(`${stats.error} error${stats.error !== 1 ? "s" : ""}`);
    if (stats.idle > 0) parts.push(`${stats.idle} idle`);

    return (
        <footer className="flex items-center gap-3 px-4 py-1.5 border-t border-border
                       bg-panel flex-shrink-0 text-[11px] text-text-muted">
            {parts.length === 0 ? (
                <span>No files loaded — drop files or use + Add Files</span>
            ) : (
                <span>{parts.join(" · ")}</span>
            )}

            {running && (
                <>
                    <span className="text-border">·</span>
                    <span className="flex items-center gap-1.5 text-running">
            <span className="spinner"/>
                        {running.settings.modelName} — {
                        running.status === "paused" ? "Paused" : `${running.progress}%`
                    }
          </span>
                </>
            )}

            {stats.error > 0 && (
                <>
                    <span className="text-border">·</span>
                    <span className="text-error">{stats.error} failed — click ⚠ to see log</span>
                </>
            )}
        </footer>
    );
}
