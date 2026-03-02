import {useRef, useState} from "react";
import {Plus} from "lucide-react";
import {open} from "@tauri-apps/plugin-dialog";
import {useAppStore} from "@/store/useAppStore";
import {FileCard} from "./FileCard";
import {EmptyState} from "./EmptyState";

export function Sidebar() {
    const files = useAppStore((s) => s.files);
    const selectedIds = useAppStore((s) => s.selectedIds);
    const {addFiles, removeFiles, clearDone, selectFile, selectAll, deselectAll} =
        useAppStore.getState();

    const [isDragOver, setIsDragOver] = useState(false);
    const dragCounter = useRef(0);

    // ── File picker ───────────────────────────────────────────────────────────

    async function handleBrowse() {
        const selected = await open({
            multiple: true,
            filters: [
                {name: "3D Models", extensions: ["obj", "gltf", "glb"]},
            ],
        });
        if (!selected) return;
        const paths = Array.isArray(selected) ? selected : [selected];
        addFiles(paths);
    }

    // ── Drag and drop ─────────────────────────────────────────────────────────

    function onDragEnter(e: React.DragEvent) {
        e.preventDefault();
        dragCounter.current++;
        setIsDragOver(true);
    }

    function onDragLeave(e: React.DragEvent) {
        e.preventDefault();
        dragCounter.current--;
        if (dragCounter.current === 0) setIsDragOver(false);
    }

    function onDragOver(e: React.DragEvent) {
        e.preventDefault();
        e.dataTransfer.dropEffect = "copy";
    }

    function onDrop(e: React.DragEvent) {
        e.preventDefault();
        dragCounter.current = 0;
        setIsDragOver(false);
        const paths: string[] = [];
        for (const file of Array.from(e.dataTransfer.files)) {
            const ext = file.name.split(".").pop()?.toLowerCase();
            if (ext === "obj" || ext === "gltf" || ext === "glb") {
                // In Tauri, file.path is available on the File object
                const path = (file as unknown as { path: string }).path;
                if (path) paths.push(path);
            }
        }
        if (paths.length > 0) addFiles(paths);
    }

    // ── Selection helpers ─────────────────────────────────────────────────────

    function handleCardClick(id: string, e: React.MouseEvent) {
        if (e.ctrlKey || e.metaKey) selectFile(id, "add");
        else if (e.shiftKey) selectFile(id, "range");
        else selectFile(id, "single");
    }

    const allSelected =
        files.length > 0 && files.every((f) => selectedIds.has(f.id));

    const removableIds = [...selectedIds].filter((id) => {
        const f = files.find((x) => x.id === id);
        return f && f.status !== "running";
    });

    return (
        <aside
            className={`flex flex-col border-r border-border w-64 min-w-[220px] max-w-xs
                  flex-shrink-0 relative transition-colors duration-150
                  ${isDragOver ? "bg-accent-dim border-accent/40" : "bg-panel"}`}
            onDragEnter={onDragEnter}
            onDragLeave={onDragLeave}
            onDragOver={onDragOver}
            onDrop={onDrop}
        >
            {/* Header */}
            <div className="flex items-center justify-between px-3 py-2.5 border-b border-border flex-shrink-0">
        <span className="text-xs font-semibold text-text-secondary uppercase tracking-widest">
          Queue
            {files.length > 0 && (
                <span className="ml-2 text-text-muted font-normal normal-case tracking-normal">
              {files.length}
            </span>
            )}
        </span>
                <button
                    className="btn-icon"
                    onClick={handleBrowse}
                    title="Add files (Ctrl+O)"
                >
                    <Plus size={15}/>
                </button>
            </div>

            {/* File list */}
            <div className="flex-1 overflow-y-auto p-2 flex flex-col gap-1.5">
                {files.length === 0 ? (
                    <EmptyState compact onBrowse={handleBrowse}/>
                ) : (
                    files.map((file) => (
                        <FileCard
                            key={file.id}
                            file={file}
                            isSelected={selectedIds.has(file.id)}
                            onClick={(e) => handleCardClick(file.id, e)}
                        />
                    ))
                )}
            </div>

            {/* Footer */}
            {files.length > 0 && (
                <div className="border-t border-border px-2 py-2 flex flex-wrap gap-1.5 flex-shrink-0">
                    <button
                        className="btn-ghost text-xs py-1 px-2"
                        onClick={allSelected ? deselectAll : selectAll}
                    >
                        {allSelected ? "Deselect All" : "Select All"}
                    </button>

                    {removableIds.length > 0 && (
                        <button
                            className="btn-ghost text-xs py-1 px-2 text-error border-error/20 hover:bg-error/10"
                            onClick={() => removeFiles(removableIds)}
                        >
                            Remove ({removableIds.length})
                        </button>
                    )}

                    <button
                        className="btn-ghost text-xs py-1 px-2"
                        onClick={clearDone}
                    >
                        Clear Done
                    </button>
                </div>
            )}

            {/* Drag overlay hint */}
            {isDragOver && (
                <div className="absolute inset-0 flex items-center justify-center pointer-events-none z-10">
                    <div className="bg-base/80 rounded-xl px-6 py-4 text-center border border-accent/40">
                        <p className="text-accent font-medium text-sm">Drop to add files</p>
                        <p className="text-text-muted text-xs mt-1">.obj · .gltf · .glb</p>
                    </div>
                </div>
            )}
        </aside>
    );
}
