import {useCallback, useEffect, useRef, useState} from "react";
import {open} from "@tauri-apps/plugin-dialog";
import {useAppStore} from "@/store/useAppStore";
import {useConversionQueue} from "@/hooks/useConversionQueue";
import {Toolbar} from "@/components/Toolbar";
import {Sidebar} from "@/components/Sidebar";
import {SettingsPanel} from "@/components/SettingsPanel";
import {LogDrawer} from "@/components/LogDrawer";
import {StatusBar} from "@/components/StatusBar";
import {PreferencesModal} from "@/components/PreferencesModal";
import type {FileEntry} from "@/types";

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

// ── App ───────────────────────────────────────────────────────────────────────

export default function App() {
    const controls = useConversionQueue();
    const logDrawerOpen = useAppStore((s) => s.logDrawerOpen);
    const prefsOpen = useAppStore((s) => s.prefsOpen);
    const files = useAppStore((s) => s.files);
    const {
        addFiles, selectAll, deselectAll, openLogDrawer, openPrefs,
        enqueueSelected,
    } = useAppStore.getState();

    const prevFilesRef = useRef<FileEntry[]>([]);
    const [toast, setToast] = useState<{ msg: string; type: "success" | "error" } | null>(null);

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
            return window.confirm(
                "Cancel all in-progress conversions?\nPartial outputs will be left on disk."
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
        },
        [addFiles, selectAll, deselectAll, openLogDrawer, openPrefs, enqueueSelected]
    );

    useEffect(() => {
        window.addEventListener("keydown", handleKeyDown);
        return () => window.removeEventListener("keydown", handleKeyDown);
    }, [handleKeyDown]);

    // ── Window-level drag and drop ────────────────────────────────────────────

    const [windowDragOver, setWindowDragOver] = useState(false);
    const windowDragCounter = useRef(0);

    function onWindowDragEnter(e: React.DragEvent) {
        e.preventDefault();
        windowDragCounter.current++;
        setWindowDragOver(true);
    }

    function onWindowDragLeave(e: React.DragEvent) {
        e.preventDefault();
        windowDragCounter.current--;
        if (windowDragCounter.current === 0) setWindowDragOver(false);
    }

    function onWindowDragOver(e: React.DragEvent) {
        e.preventDefault();
    }

    function onWindowDrop(e: React.DragEvent) {
        e.preventDefault();
        windowDragCounter.current = 0;
        setWindowDragOver(false);
        const paths: string[] = [];
        for (const file of Array.from(e.dataTransfer.files)) {
            const ext = file.name.split(".").pop()?.toLowerCase();
            if (ext === "obj" || ext === "gltf" || ext === "glb") {
                const p = (file as unknown as { path: string }).path;
                if (p) paths.push(p);
            }
        }
        if (paths.length > 0) addFiles(paths);
    }

    // ── Global progress (top bar) ─────────────────────────────────────────────

    const total = files.length;
    const done = files.filter((f) => f.status === "done" || f.status === "error").length;
    const topProgress = total > 0 ? (done / total) * 100 : 0;
    const anyRunning = files.some((f) => f.status === "running" || f.status === "paused");

    return (
        <div
            className="flex flex-col h-screen bg-base overflow-hidden"
            onDragEnter={onWindowDragEnter}
            onDragLeave={onWindowDragLeave}
            onDragOver={onWindowDragOver}
            onDrop={onWindowDrop}
        >
            {/* Custom title bar */}
            <div className="titlebar">
        <span className="text-[11px] text-text-muted font-medium tracking-wide select-none">
          Minecraft Voxelizer
        </span>
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
