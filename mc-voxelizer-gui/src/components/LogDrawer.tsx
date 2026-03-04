import React, {useEffect, useRef, useState} from "react";
import {ChevronDown, Copy, Download, Search} from "lucide-react";
import {useAppStore} from "@/store/useAppStore";
import type {LogLevel, LogLine} from "@/types";
import {save} from "@tauri-apps/plugin-dialog";
import {writeTextFile} from "@tauri-apps/plugin-fs";

// ── Persist drawer width across close/open within a session ──────────────────
let savedLogDrawerWidth = 384; // default: matches former w-96

export function LogDrawer() {
    const files = useAppStore((s) => s.files);
    const filterFileId = useAppStore((s) => s.logFilterFileId);
    useAppStore.getState();

    const [search, setSearch] = useState("");
    const [levels, setLevels] = useState<Set<LogLevel>>(
        new Set(["info", "warning", "error", "debug"])
    );
    const [autoScroll, setAutoScroll] = useState(true);
    const [showTimestamps, setShowTimestamps] = useState(true);
    const [fileFilter, setFileFilter] = useState(filterFileId);

    // Fix #7: resizable width, restored from last session
    const [width, setWidth] = useState(savedLogDrawerWidth);

    const scrollRef = useRef<HTMLDivElement>(null);
    const bottomRef = useRef<HTMLDivElement>(null);

    // Sync external filter changes (e.g. clicking error card)
    useEffect(() => setFileFilter(filterFileId), [filterFileId]);

    // ── Resize handle (left edge) ─────────────────────────────────────────────

    function handleResizeMouseDown(e: React.MouseEvent) {
        e.preventDefault();
        const startX = e.clientX;
        const startWidth = width;

        function onMouseMove(e: MouseEvent) {
            // Dragging left (negative delta) expands; dragging right shrinks
            const delta = startX - e.clientX;
            const newWidth = Math.max(280, Math.min(900, startWidth + delta));
            setWidth(newWidth);
            savedLogDrawerWidth = newWidth;
        }

        function onMouseUp() {
            window.removeEventListener("mousemove", onMouseMove);
            window.removeEventListener("mouseup", onMouseUp);
        }

        window.addEventListener("mousemove", onMouseMove);
        window.addEventListener("mouseup", onMouseUp);
    }

    // ── Collect visible log lines ─────────────────────────────────────────────

    const visibleLines: Array<LogLine & { fileName: string }> = [];

    for (const file of files) {
        if (fileFilter !== "all" && file.id !== fileFilter) continue;
        for (const line of file.log) {
            if (!levels.has(line.level)) continue;
            if (search && !line.text.toLowerCase().includes(search.toLowerCase())) continue;
            visibleLines.push({
                ...line,
                fileName: file.settings.modelName || file.id,
            });
        }
    }

    // Sort by timestamp
    visibleLines.sort((a, b) => a.timestamp.getTime() - b.timestamp.getTime());

    // ── Auto-scroll ───────────────────────────────────────────────────────────

    useEffect(() => {
        if (autoScroll && bottomRef.current) {
            bottomRef.current.scrollIntoView({behavior: "smooth"});
        }
    }, [visibleLines.length, autoScroll]);

    function handleScroll() {
        const el = scrollRef.current;
        if (!el) return;
        const atBottom = el.scrollHeight - el.scrollTop - el.clientHeight < 40;
        setAutoScroll(atBottom);
    }

    // ── Copy / save ───────────────────────────────────────────────────────────

    function copyAll() {
        const text = visibleLines
            .map((l) => `${l.timestamp.toTimeString().slice(0, 8)} [${l.level.toUpperCase()}] ${l.text}`)
            .join("\n");
        navigator.clipboard.writeText(text);
    }

    async function saveToFile() {
        const path = await save({
            filters: [{name: "Text", extensions: ["txt"]}],
            defaultPath: "voxelizer-log.txt",
        });
        if (!path) return;
        const text = visibleLines
            .map((l) => `${l.timestamp.toISOString()} [${l.level.toUpperCase()}] ${l.text}`)
            .join("\n");
        await writeTextFile(path, text);
    }

    function toggleLevel(level: LogLevel) {
        setLevels((prev) => {
            const next = new Set(prev);
            if (next.has(level)) next.delete(level);
            else next.add(level);
            return next;
        });
    }

    // ── Log line colour ───────────────────────────────────────────────────────

    function lineClass(line: LogLine): string {
        if (line.text.includes("Done!")) return "log-done";
        if (line.level === "error") return "log-error";
        if (line.level === "warning") return "log-warning";
        if (line.level === "debug") return "log-debug";
        return "log-info";
    }

    return (
        <div
            className="flex-shrink-0 border-l border-border flex flex-col bg-panel animate-slide-in-right relative"
            style={{width: `${width}px`, minWidth: "280px"}}
        >
            {/* Fix #7: left-edge resize handle */}
            <div
                className="absolute left-0 top-0 bottom-0 w-1.5 cursor-col-resize z-10
                           hover:bg-accent/40 active:bg-accent/60 transition-colors"
                onMouseDown={handleResizeMouseDown}
                title="Drag to resize"
            />

            {/* Header — Fix #5: removed X, Copy moved to where Download was, Download at far right */}
            <div className="flex items-center gap-2 px-3 py-2.5 border-b border-border flex-shrink-0">
                <span className="text-xs font-semibold uppercase tracking-widest text-text-secondary">
                    Logs
                </span>
                <span className="text-xs text-text-muted ml-1">
                    {visibleLines.length} lines
                </span>
                <div className="ml-auto flex gap-1">
                    {/* Fix #5: Copy shifted right (where Download was), Download at end (where X was) */}
                    <button className="btn-icon" title="Copy all to clipboard" onClick={copyAll}>
                        <Copy size={14}/>
                    </button>
                    <button className="btn-icon" title="Save to file" onClick={saveToFile}>
                        <Download size={14}/>
                    </button>
                    {/* X button removed — use the >_ toolbar button to collapse */}
                </div>
            </div>

            {/* File filter */}
            <div className="px-2 py-1.5 border-b border-border flex-shrink-0">
                <select
                    className="field text-xs py-1"
                    value={fileFilter}
                    onChange={(e) => setFileFilter(e.target.value)}
                >
                    <option value="all">All files</option>
                    {files.map((f) => (
                        <option key={f.id} value={f.id}>
                            {f.settings.modelName || f.id}
                        </option>
                    ))}
                </select>
            </div>

            {/* Search */}
            <div className="px-2 py-1.5 border-b border-border flex-shrink-0">
                <div className="relative">
                    <Search size={12} className="absolute left-2.5 top-1/2 -translate-y-1/2 text-text-muted"/>
                    <input
                        className="field text-xs pl-7 py-1"
                        placeholder="Filter lines…"
                        value={search}
                        onChange={(e) => setSearch(e.target.value)}
                    />
                </div>
            </div>

            {/* Level toggles */}
            <div className="px-2 py-1.5 border-b border-border flex gap-1.5 flex-shrink-0 items-center">
                {(["info", "warning", "error", "debug"] as LogLevel[]).map((lvl) => (
                    <button
                        key={lvl}
                        className={`text-[11px] px-2.5 py-0.5 rounded border transition-colors font-medium ${
                            levels.has(lvl)
                                ? lvl === "warning"
                                    ? "bg-warning/15 border-warning/30 text-warning"
                                    : lvl === "error"
                                        ? "bg-error/15 border-error/30 text-error"
                                        : lvl === "debug"
                                            ? "bg-border border-border-bright text-text-muted"
                                            : "bg-accent/10 border-accent/30 text-accent"
                                : "bg-transparent border-border text-text-muted opacity-40"
                        }`}
                        onClick={() => toggleLevel(lvl)}
                    >
                        {lvl}
                    </button>
                ))}
                <button
                    className="ml-auto btn-icon p-0.5"
                    title="Toggle timestamps"
                    onClick={() => setShowTimestamps((v) => !v)}
                >
                    <span className="text-[10px] mono text-text-muted">HH:MM</span>
                </button>
            </div>

            {/* Log content */}
            <div
                ref={scrollRef}
                className="flex-1 overflow-y-auto p-2 font-mono text-[12px] leading-relaxed log-selectable"
                onScroll={handleScroll}
            >
                {visibleLines.length === 0 ? (
                    <p className="text-text-muted text-center mt-8 text-xs">No log lines match the current filter.</p>
                ) : (
                    visibleLines.map((line) => (
                        <div key={line.id} className={`flex gap-2 ${lineClass(line)}`}>
                            {showTimestamps && (
                                <span className="text-text-muted shrink-0 select-none">
                                    {line.timestamp.toTimeString().slice(0, 8)}
                                </span>
                            )}
                            {files.length > 1 && fileFilter === "all" && (
                                <span className="text-text-muted shrink-0 truncate max-w-[80px]" title={line.fileName}>
                                    [{line.fileName}]
                                </span>
                            )}
                            <span className="break-all">{line.text}</span>
                        </div>
                    ))
                )}
                <div ref={bottomRef}/>
            </div>

            {/* Auto-scroll indicator */}
            {!autoScroll && (
                <div className="px-3 py-1.5 border-t border-border flex-shrink-0">
                    <button
                        className="text-[11px] text-accent underline w-full text-center"
                        onClick={() => {
                            setAutoScroll(true);
                            bottomRef.current?.scrollIntoView({behavior: "smooth"});
                        }}
                    >
                        <ChevronDown size={11} className="inline mr-1"/>
                        Jump to latest
                    </button>
                </div>
            )}
        </div>
    );
}
