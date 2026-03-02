import {FileBox, Upload} from "lucide-react";

interface Props {
    compact?: boolean;
    onBrowse: () => void;
}

export function EmptyState({compact = false, onBrowse}: Props) {
    if (compact) {
        return (
            <div className="flex flex-col items-center justify-center h-full gap-2 p-4 text-center">
                <FileBox size={24} className="text-text-muted"/>
                <p className="text-xs text-text-muted leading-relaxed">
                    Drop files here
                    <br/>
                    or use + Add Files
                </p>
            </div>
        );
    }

    return (
        <div className="flex flex-col items-center justify-center h-full gap-6 animate-fade-in">
            {/* Dashed drop zone box */}
            <div
                className="flex flex-col items-center gap-4 p-12 rounded-xl cursor-pointer
                   border-2 border-dashed border-border-bright
                   hover:border-accent/50 hover:bg-accent-dim transition-all duration-200 group"
                onClick={onBrowse}
            >
                <div className="w-16 h-16 rounded-2xl bg-card-hover flex items-center justify-center
                        group-hover:bg-accent/10 transition-colors">
                    <Upload size={28} className="text-text-muted group-hover:text-accent transition-colors"/>
                </div>

                <div className="text-center">
                    <p className="text-text-primary font-medium text-base mb-1">
                        Drop 3D model files here
                    </p>
                    <p className="text-text-muted text-sm">
                        .obj · .gltf · .glb
                    </p>
                </div>

                <span className="text-xs text-text-muted">— or —</span>

                <button className="btn-primary text-sm px-6 py-2">
                    Browse for Files
                </button>
            </div>

            <p className="text-xs text-text-muted">
                Files are processed sequentially. Settings can be changed per-file.
            </p>
        </div>
    );
}
