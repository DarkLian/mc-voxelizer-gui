import {useRef, useState} from "react";
import {
  AlertCircle,
  CheckCircle2,
  Circle,
  Clock,
  Copy,
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
    idle: <Circle size={10} className="text-text-muted"/>,
    queued: <Clock size={10} className="text-queued"/>,
    running: <Loader2 size={10} className="text-running animate-spin"/>,
    paused: <PauseCircle size={10} className="text-paused"/>,
    done: <CheckCircle2 size={10} className="text-done"/>,
    error: <AlertCircle size={10} className="text-error"/>,
    cancelled: <XCircle size={10} className="text-cancelled"/>,
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
    const {removeFiles, openLogDrawer, addFiles} = useAppStore.getState();

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

    function handleDuplicate() {
        addFiles([file.sourcePath]);
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
                ? "border-accent/40 bg-accent-dim"
                : "border-border bg-card hover:bg-card-hover hover:border-border-bright"
            }`}
            onClick={onClick}
        >
            {/* Status accent left bar */}
            <div className={`w-0.5 rounded-l-md flex-shrink-0 status-bar-${file.status}`}/>

            {/* Main content */}
            <div className="flex-1 p-2.5 min-w-0">
                {/* Row 1: name + status */}
                <div className="flex items-center gap-1.5 mb-0.5">
                    {STATUS_ICON[file.status]}
                    <span className="text-text-primary text-sm font-medium truncate flex-1">
            {name}
          </span>
                    <span className={`text-[10px] shrink-0 ${
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
                    className="text-[11px] text-text-muted truncate mb-1"
                    title={file.sourcePath}
                >
                    {shortenPath(file.sourcePath, 38)}
                </p>

                {/* Row 3: settings summary */}
                <p className="text-[11px] text-text-muted mono">{settingsSummary}</p>

                {/* Row 4: progress bar (active only) */}
                {isActive && (
                    <div className="mt-2">
                        <div className="progress-bar">
                            <div
                                className={`progress-fill ${file.status === "paused" ? "paused" : ""}`}
                                style={{width: `${file.progress}%`}}
                            />
                        </div>
                        <div className="flex justify-between mt-1">
                            <span className="text-[10px] text-text-muted mono">{file.progress}%</span>
                            <span className="text-[10px] text-text-muted mono">
                {formatElapsed(file.elapsedMs)}
              </span>
                        </div>
                    </div>
                )}

                {/* Row: done elapsed */}
                {file.status === "done" && file.elapsedMs > 0 && (
                    <p className="text-[10px] text-done mt-1 mono">
                        ✓ {formatElapsed(file.elapsedMs)}
                    </p>
                )}

                {/* Row: error summary */}
                {file.status === "error" && file.errorSummary && (
                    <p
                        className="text-[10px] text-error mt-1 truncate"
                        title={file.errorSummary}
                    >
                        {file.errorSummary}
                    </p>
                )}
            </div>

            {/* Overflow menu button */}
            <div className="flex flex-col justify-start pt-2 pr-1.5">
                <button
                    className="btn-icon p-1 opacity-0 group-hover:opacity-100 transition-opacity"
                    onClick={(e) => {
                        e.stopPropagation();
                        setMenuOpen((v) => !v);
                    }}
                    title="More options"
                >
                    <MoreVertical size={13}/>
                </button>
            </div>

            {/* Dropdown menu */}
            {menuOpen && (
                <>
                    <div
                        className="fixed inset-0 z-40"
                        onClick={(e) => {
                            e.stopPropagation();
                            setMenuOpen(false);
                        }}
                    />
                    <div
                        ref={menuRef}
                        className="absolute right-1 top-8 z-50 bg-panel border border-border-bright
                       rounded-md shadow-xl min-w-[170px] py-1 animate-fade-in"
                        onClick={(e) => e.stopPropagation()}
                    >
                        <MenuItem icon={<Terminal size={13}/>} label="View Log"
                                  onClick={() => {
                                      openLogDrawer(file.id);
                                      setMenuOpen(false);
                                  }}/>

                        {file.status === "done" && (
                            <MenuItem icon={<FolderOpen size={13}/>} label="Open Output Folder"
                                      onClick={handleOpenOutput}/>
                        )}

                        <MenuItem icon={<FileSearch size={13}/>} label="Reveal Source File"
                                  onClick={handleRevealSource}/>

                        <MenuItem icon={<Copy size={13}/>} label="Duplicate Entry"
                                  onClick={handleDuplicate}/>

                        <div className="border-t border-border my-1"/>

                        <MenuItem icon={<Trash2 size={13}/>} label="Remove from Queue"
                                  onClick={handleRemove}
                                  danger
                                  disabled={file.status === "running"}
                        />
                    </div>
                </>
            )}
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
