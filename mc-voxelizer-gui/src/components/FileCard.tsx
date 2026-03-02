import {useRef, useState} from "react";
import {
    AlertCircle,
    CheckCircle2,
    Clock,
    FileSearch,
    FolderOpen,
    Loader2,
    MoreVertical,
    PauseCircle,
    Terminal,
    Trash2,
    XCircle,
} from "lucide-react";
import type {FileEntry} from "@/types";
import {shortenPath} from "@/utils/pathUtils";
import {useAppStore} from "@/store/useAppStore";

interface Props {
    file: FileEntry;
    isSelected: boolean;
    onClick: (e: React.MouseEvent) => void;
}

const STATUS_ICON = {
    idle: <span className="w-2.5 h-2.5 rounded-full border border-text-muted/40 inline-block"/>,
    queued: <Clock size={11} className="text-queued"/>,
    running: <Loader2 size={11} className="text-running animate-spin"/>,
    paused: <PauseCircle size={11} className="text-paused"/>,
    done: <CheckCircle2 size={11} className="text-done"/>,
    error: <AlertCircle size={11} className="text-error"/>,
    cancelled: <XCircle size={11} className="text-cancelled"/>,
} as const;

const STATUS_LABEL = {
    idle: "Idle",
    queued: "Queued",
    running: "Converting",
    paused: "Paused",
    done: "Done",
    error: "Error",
    cancelled: "Cancelled",
} as const;

function formatElapsed(ms: number): string {
    if (ms < 1000) return `${ms}ms`;
    if (ms < 60000) return `${(ms / 1000).toFixed(1)}s`;
    const m = Math.floor(ms / 60000);
    const s = Math.floor((ms % 60000) / 1000);
    return `${m}m ${s}s`;
}

export function FileCard({file, isSelected, onClick}: Props) {
    const [menuOpen, setMenuOpen] = useState(false);
    const menuRef = useRef<HTMLDivElement>(null);
    const {removeFiles, openLogDrawer} = useAppStore.getState();

    const isActive = file.status === "running" || file.status === "paused";
    const name = file.settings.modelName || file.sourcePath.split(/[\\/]/).pop();
    const settingsSummary = `Q${file.settings.quality} · ${
        file.settings.density === 0 ? "Auto" : `D${file.settings.density}`
    } · ${file.settings.modId}`;

    async function handleOpenOutput() {
        if (!file.outputJson) return;
        const dir = file.outputJson.replace(/[\\/][^\\/]+$/, "");
        const {invoke} = await import("@tauri-apps/api/core");
        await invoke("open_folder", {path: dir}).catch(console.error);
        setMenuOpen(false);
    }

    async function handleRevealSource() {
        const {invoke} = await import("@tauri-apps/api/core");
        await invoke("reveal_file", {path: file.sourcePath}).catch(console.error);
        setMenuOpen(false);
    }

    function handleRemove() {
        removeFiles([file.id]);
        setMenuOpen(false);
    }

    return (
        <div
            className={`relative flex items-stretch rounded-md cursor-pointer
        border transition-all duration-100 group
        ${isSelected
                ? "border-accent/50 bg-accent-dim"
                : "border-border bg-card hover:bg-card-hover hover:border-border-bright"
            }`}
            onClick={onClick}
        >
            {/* Status accent left bar */}
            <div className={`w-1 rounded-l-md flex-shrink-0 status-bar-${file.status}`}/>

            {/* Selection circle */}
            <div className="flex items-center pl-2.5 pr-1 flex-shrink-0">
                <div className={`file-select-circle ${isSelected ? "selected" : ""}`}/>
            </div>

            {/* Main content */}
            <div className="flex-1 p-2.5 min-w-0 pl-1">
                {/* Row 1: name + status icon */}
                <div className="flex items-center gap-1.5 mb-0.5">
                    {STATUS_ICON[file.status]}
                    <span className="text-text-primary text-sm font-medium truncate flex-1">
                        {name}
                    </span>
                    <span className={`text-[11px] shrink-0 ${
                        file.status === "error" ? "text-error" :
                            file.status === "done" ? "text-done" :
                                file.status === "running" ? "text-running" :
                                    "text-text-muted"
                    }`}>
                        {STATUS_LABEL[file.status]}
                    </span>
                </div>

                {/* Row 2: source path */}
                <p
                    className="text-[12px] text-text-muted truncate mb-1"
                    title={file.sourcePath}
                >
                    {shortenPath(file.sourcePath, 38)}
                </p>

                {/* Row 3: settings summary */}
                <p className="text-[12px] text-text-muted mono">{settingsSummary}</p>

                {/* Row 4: progress bar (active only) */}
                {isActive && (
                    <div className="mt-2">
                        <div className="progress-bar">
                            <div
                                className={`progress-fill ${file.status === "paused"
                                    ? "progress-fill-paused"
                                    : "progress-fill-running"
                                }`}
                                style={{width: `${file.progress}%`}}
                            />
                        </div>
                        <div className="flex justify-between mt-0.5">
                            <span className="text-[11px] text-text-muted">{file.progress}%</span>
                            {file.elapsedMs > 0 && (
                                <span className="text-[11px] text-text-muted">{formatElapsed(file.elapsedMs)}</span>
                            )}
                        </div>
                    </div>
                )}

                {/* Error summary */}
                {file.status === "error" && file.errorSummary && (
                    <p className="text-[11px] text-error mt-1 truncate" title={file.errorSummary}>
                        {file.errorSummary}
                    </p>
                )}
            </div>

            {/* Context menu button */}
            <div className="flex items-start pt-2 pr-1.5 flex-shrink-0">
                <button
                    className="btn-icon opacity-0 group-hover:opacity-100 transition-opacity p-1"
                    onClick={(e) => {
                        e.stopPropagation();
                        setMenuOpen((v) => !v);
                    }}
                >
                    <MoreVertical size={13}/>
                </button>

                {menuOpen && (
                    <>
                        <div
                            className="fixed inset-0 z-10"
                            onClick={() => setMenuOpen(false)}
                        />
                        <div
                            ref={menuRef}
                            className="absolute right-1 top-8 z-20 bg-panel border border-border-bright
                                rounded-lg shadow-2xl py-1 min-w-[170px] animate-fade-in"
                        >
                            <MenuItem
                                icon={<Terminal size={13}/>}
                                label="View Logs"
                                onClick={() => {
                                    openLogDrawer(file.id);
                                    setMenuOpen(false);
                                }}
                            />

                            {file.status === "done" && (
                                <MenuItem
                                    icon={<FolderOpen size={13}/>}
                                    label="Open Output Folder"
                                    onClick={handleOpenOutput}
                                />
                            )}

                            <MenuItem
                                icon={<FileSearch size={13}/>}
                                label="Reveal Source File"
                                onClick={handleRevealSource}
                            />

                            <div className="border-t border-border my-1"/>

                            <MenuItem
                                icon={<Trash2 size={13}/>}
                                label="Remove from Queue"
                                onClick={handleRemove}
                                danger
                                disabled={file.status === "running"}
                            />
                        </div>
                    </>
                )}
            </div>
        </div>
    );
}

function MenuItem({
                      icon, label, onClick, danger, disabled,
                  }: {
    icon: React.ReactNode;
    label: string;
    onClick: () => void;
    danger?: boolean;
    disabled?: boolean;
}) {
    return (
        <button
            className={`flex items-center gap-2 w-full px-3 py-1.5 text-xs text-left
                  transition-colors ${
                danger
                    ? "text-error hover:bg-error/10"
                    : "text-text-secondary hover:bg-card-hover hover:text-text-primary"
            } ${disabled ? "opacity-40 pointer-events-none" : ""}`}
            onClick={onClick}
            disabled={disabled}
        >
            {icon}
            {label}
        </button>
    );
}
