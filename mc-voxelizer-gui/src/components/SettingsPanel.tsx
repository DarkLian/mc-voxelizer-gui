import {selectSelectedFiles, useAppStore} from "@/store/useAppStore";
import {EmptyState} from "./EmptyState";
import {SingleFileSettings} from "./SingleFileSettings";
import {BatchSettings} from "./BatchSettings";
import {open} from "@tauri-apps/plugin-dialog";

export function SettingsPanel() {
    const selected = useAppStore(selectSelectedFiles);
    const addFiles = useAppStore((s) => s.addFiles);

    async function handleBrowse() {
        const result = await open({
            multiple: true,
            filters: [{name: "3D Models", extensions: ["obj", "gltf", "glb"]}],
        });
        if (!result) return;
        const paths = Array.isArray(result) ? result : [result];
        addFiles(paths);
    }

    if (selected.length === 0) {
        return (
            <div className="flex-1 flex items-center justify-center bg-base">
                <EmptyState onBrowse={handleBrowse}/>
            </div>
        );
    }

    if (selected.length === 1) {
        return (
            <div className="flex-1 flex flex-col bg-base overflow-hidden">
                {/* File header */}
                <div className="px-5 py-3 border-b border-border flex items-center gap-2 flex-shrink-0">
          <span
              className="text-sm font-medium text-text-primary truncate"
              title={selected[0].sourcePath}
          >
            {selected[0].settings.modelName}
          </span>
                    <span className="text-xs text-text-muted truncate flex-1" title={selected[0].sourcePath}>
            {selected[0].sourcePath.replace(/\\/g, "/").split("/").pop()}
          </span>
                </div>
                <SingleFileSettings file={selected[0]}/>
            </div>
        );
    }

    return (
        <div className="flex-1 flex flex-col bg-base overflow-hidden">
            <BatchSettings files={selected}/>
        </div>
    );
}
