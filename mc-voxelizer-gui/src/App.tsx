import {useCallback, useEffect, useRef, useState} from "react";
import {open} from "@tauri-apps/plugin-dialog";
import {getCurrentWindow} from "@tauri-apps/api/window";
import {desktopDir} from "@tauri-apps/api/path";
import {useAppStore} from "@/store/useAppStore";
import {useConversionQueue} from "@/hooks/useConversionQueue";
import {Toolbar} from "@/components/Toolbar";
import {Sidebar} from "@/components/Sidebar";
import {SettingsPanel} from "@/components/SettingsPanel";
import {LogDrawer} from "@/components/LogDrawer";
import {StatusBar} from "@/components/StatusBar";
import {PreferencesModal} from "@/components/PreferencesModal";
import type {FileEntry} from "@/types";
import {Minus, Square, X} from "lucide-react";

// ── Toast notification ────────────────────────────────────────────────────────

function Toast({message, type}: { message: string; type: "success" | "error" }) {
    return (
        <div className={`fixed bottom-10 left-1/2 -translate-x-1/2 z-50
      px-4 py-2 rounded-lg shadow-2xl text-sm font-medium animate-fade-in
      border ${type === "success"
            ? "bg-done/10 border-done/30 text-done"
            : "bg-error/10 border-error/30 text-error"}`}>
            {message}
        </div>
    );
}

// ── Titlebar window controls ──────────────────────────────────────────────────

function TitlebarButtons() {
    const [isMaximized, setIsMaximized] = useState(false);
    const appWindow = getCurrentWindow();

    useEffect(() => {
        appWindow.isMaximized().then(setIsMaximized);
        const unlisten = appWindow.onResized(() => {
            appWindow.isMaximized().then(setIsMaximized);
        });
        return () => {
            unlisten.then(fn => fn());
        };
    }, []);

    return (
        <div className="titlebar-buttons">
            <button
                className="titlebar-btn titlebar-minimize"
                onClick={() => appWindow.minimize()}
                title="Minimize"
            >
                <Minus size={11}/>
            </button>
            <button
                className="titlebar-btn titlebar-maximize"
                onClick={() => appWindow.toggleMaximize()}
                title={isMaximized ? "Restore" : "Maximize"}
            >
                {isMaximized
                    ? <svg width="11" height="11" viewBox="0 0 11 11" fill="currentColor">
                        <path d="M3 0H11V8H9V2H3V0ZM0 3H8V11H0V3ZM1 4V10H7V4H1Z"/>
                    </svg>
                    : <Square size={11}/>
                }
            </button>
            <button
                className="titlebar-btn titlebar-close"
                onClick={() => appWindow.close()}
                title="Close"
            >
                <X size={11}/>
            </button>
        </div>
    );
}

// ── App ───────────────────────────────────────────────────────────────────────

export default function App() {
    const controls = useConversionQueue();
    const logDrawerOpen = useAppStore((s) => s.logDrawerOpen);
    const prefsOpen = useAppStore((s) => s.prefsOpen);
    const files = useAppStore((s) => s.files);
    const {
        addFiles, selectAll, deselectAll, openLogDrawer, openPrefs,
        enqueueSelected, updatePreferences,
    } = useAppStore.getState();

    const prevFilesRef = useRef<FileEntry[]>([]);
    const [toast, setToast] = useState<{ msg: string; type: "success" | "error" } | null>(null);

    // ── Init default output dir → Desktop on first run ────────────────────────

    useEffect(() => {
        const prefs = useAppStore.getState().preferences;
        if (!prefs.defaultOutputDir) {
            desktopDir().then((dir) => {
                updatePreferences({defaultOutputDir: dir});
            }).catch(() => {
                updatePreferences({defaultOutputDir: "."});
            });
        }
    }, []);

    // ── Toast helper ─────────────────────────────────────────────────────────

    function showToast(msg: string, type: "success" | "error") {
        setToast({msg, type});
        setTimeout(() => setToast(null), 3000);
    }

    // ── Watch for file completions → toast ───────────────────────────────────

    useEffect(() => {
        const prev = prevFilesRef.current;
        const prefs = useAppStore.getState().preferences;
        if (!prefs.showToastOnComplete) return;

        for (const f of files) {
            const prevF = prev.find((x) => x.id === f.id);
            if (!prevF) continue;
            if (prevF.status !== "done" && f.status === "done") {
                showToast(`✓ ${f.settings.modelName} converted`, "success");
            }
            if (prevF.status !== "error" && f.status === "error") {
                showToast(`✗ ${f.settings.modelName} failed`, "error");
            }
        }
        prevFilesRef.current = files;
    }, [files]);

    // ── Cancel confirmation helper ────────────────────────────────────────────

    useEffect(() => {
        window.__confirmCancelAll = async () => {
            const { confirm } = await import("@tauri-apps/plugin-dialog");
            return confirm(
                "Cancel all in-progress conversions?\nPartial outputs will be left on disk.",
                { title: "Cancel Conversions", kind: "warning" }
            );
        };
    }, []);

    // ── Keyboard shortcuts ────────────────────────────────────────────────────

    const handleKeyDown = useCallback(
        async (e: KeyboardEvent) => {
            if (e.ctrlKey && e.key === "o") {
                e.preventDefault();
                const result = await open({
                    multiple: true,
                    filters: [{name: "3D Models", extensions: ["obj", "gltf", "glb"]}],
                });
                if (!result) return;
                addFiles(Array.isArray(result) ? result : [result]);
            }
            if (e.ctrlKey && e.key === "a") {
                e.preventDefault();
                selectAll();
            }
            if (e.ctrlKey && e.key === "l") {
                e.preventDefault();
                openLogDrawer();
            }
            if (e.ctrlKey && e.key === ",") {
                e.preventDefault();
                openPrefs();
            }
            if (e.key === "Escape") {
                deselectAll();
            }
            if (e.ctrlKey && e.key === "Enter") {
                e.preventDefault();
                enqueueSelected();
            }
            if (e.key === "F11") {
                e.preventDefault();
                const appWindow = getCurrentWindow();
                const isFullscreen = await appWindow.isFullscreen();
                await appWindow.setFullscreen(!isFullscreen);
            }
        },
        [addFiles, selectAll, deselectAll, openLogDrawer, openPrefs, enqueueSelected]
    );

    useEffect(() => {
        window.addEventListener("keydown", handleKeyDown);
        return () => window.removeEventListener("keydown", handleKeyDown);
    }, [handleKeyDown]);

    // ── Window-level drag and drop (via Tauri file-drop events) ─────────────

    const [windowDragOver, setWindowDragOver] = useState(false);

    useEffect(() => {
        const appWindow = getCurrentWindow();
        let unlisten: (() => void) | null = null;

        appWindow.onDragDropEvent((event) => {
            const type = event.payload.type;
            if (type === "enter" || type === "over") {
                setWindowDragOver(true);
            } else if (type === "leave") {
                setWindowDragOver(false);
            } else if (type === "drop") {
                setWindowDragOver(false);
                // Tauri v2 drop payload has .paths[]
                const paths: string[] = (event.payload as any).paths ?? [];
                const valid = paths.filter((p) => {
                    const ext = p.split(".").pop()?.toLowerCase();
                    return ext === "obj" || ext === "gltf" || ext === "glb";
                });
                if (valid.length > 0) addFiles(valid);
            }
        }).then((fn) => {
            unlisten = fn;
        });

        return () => {
            unlisten?.();
        };
    }, [addFiles]);

    // Prevent default browser drag behaviour (so Tauri events fire cleanly)
    function onWindowDragOver(e: React.DragEvent) {
        e.preventDefault();
    }

    // ── Global progress (top bar) ─────────────────────────────────────────────

    const total = files.length;
    const done = files.filter((f) => f.status === "done" || f.status === "error").length;
    const topProgress = total > 0 ? (done / total) * 100 : 0;
    const anyRunning = files.some((f) => f.status === "running" || f.status === "paused");

    return (
        <div
            className="flex flex-col h-screen bg-base overflow-hidden"
            onDragOver={onWindowDragOver}
        >
            {/* Custom title bar */}
            <div className="titlebar" data-tauri-drag-region>
                <span className="text-[12px] text-text-muted font-medium tracking-wide select-none">
                    Minecraft Voxelizer
                </span>
                <TitlebarButtons/>
            </div>

            {/* Top progress bar */}
            <div className="top-progress-bar">
                {anyRunning && (
                    <div
                        className="top-progress-fill animate-progress-pulse"
                        style={{width: `${Math.max(topProgress, 5)}%`}}
                    />
                )}
            </div>

            {/* Toolbar */}
            <Toolbar controls={controls}/>

            {/* Main area */}
            <div className="flex flex-1 overflow-hidden">
                <Sidebar/>
                <SettingsPanel/>
                {logDrawerOpen && <LogDrawer/>}
            </div>

            {/* Status bar */}
            <StatusBar/>

            {/* Preferences modal */}
            {prefsOpen && <PreferencesModal/>}

            {/* Window-level drop overlay */}
            {windowDragOver && (
                <div className="drop-overlay">
                    <div className="text-center">
                        <p className="text-2xl font-semibold text-accent mb-2">Drop files to add</p>
                        <p className="text-text-muted">.obj · .gltf · .glb</p>
                    </div>
                </div>
            )}

            {/* Toast notifications */}
            {toast && <Toast message={toast.msg} type={toast.type}/>}
        </div>
    );
}
