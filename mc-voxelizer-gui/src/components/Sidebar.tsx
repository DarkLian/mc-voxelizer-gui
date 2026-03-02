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

    // ── Selection helpers ─────────────────────────────────────────────────────

    function handleCardClick(id: string, e: React.MouseEvent) {
        if (e.ctrlKey || e.metaKey) {
            selectFile(id, "add");
        } else if (e.shiftKey) {
            selectFile(id, "range");
        } else {
            // Toggle: deselect if this is already the only selected file,
            // otherwise select it (clears any multi-selection first).
            const {selectedIds} = useAppStore.getState();
            if (selectedIds.size === 1 && selectedIds.has(id)) {
                deselectAll();
            } else {
                selectFile(id, "single");
            }
        }
    }

    const allSelected =
        files.length > 0 && files.every((f) => selectedIds.has(f.id));

    const removableIds = [...selectedIds].filter((id) => {
        const f = files.find((x) => x.id === id);
        return f && f.status !== "running";
    });

    return (
        <aside className="flex flex-col border-r border-border w-72 min-w-[240px] max-w-xs
                          flex-shrink-0 relative transition-colors duration-150">

            {/* Header */}
            <div className="flex items-center justify-between px-3 py-3 border-b border-border flex-shrink-0">
                <span className="text-xs font-semibold text-text-secondary uppercase tracking-widest">
                    Queue
                    {files.length > 0 && (
                        <span className="ml-2 text-text-muted font-normal normal-case tracking-normal">
                            {files.length}
                        </span>
                    )}
                </span>
                <div className="flex items-center gap-1">
                    <span className="text-[10px] text-text-muted mr-1 select-none">Ctrl+click to multi-select</span>
                    <button
                        className="btn-icon"
                        onClick={handleBrowse}
                        title="Add files (Ctrl+O)"
                    >
                        <Plus size={16}/>
                    </button>
                </div>
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
        </aside>
    );
}
