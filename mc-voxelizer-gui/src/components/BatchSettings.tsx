import React, {useState} from "react";
import {FolderOpen} from "lucide-react";
import {open} from "@tauri-apps/plugin-dialog";
import type {FileEntry, FileSettings, OptimizationMode} from "@/types";
import {QUALITY_LABELS, QUALITY_RESOLUTION} from "@/types";
import {useAppStore} from "@/store/useAppStore";
import {isValidModId} from "@/utils/pathUtils";

interface Props {
    files: FileEntry[];
}

/** Returns the shared value if all files agree, otherwise null (meaning "multiple values"). */
function sharedValue<T>(files: FileEntry[], getter: (f: FileEntry) => T): T | null {
    const vals = files.map(getter);
    return vals.every((v) => v === vals[0]) ? vals[0] : null;
}

const DENSITY_PRESETS = [0, 1, 2, 4, 8, 16, 32];

export function BatchSettings({files}: Props) {
    const {applySettingsToIds} = useAppStore.getState();
    const ids = files.map((f) => f.id);

    // Local draft for batch fields
    const [outputDir, setOutputDir] = useState<string>(() => sharedValue(files, (f) => f.settings.outputDir ?? "") ?? "");
    const [modId, setModId] = useState<string>(() => sharedValue(files, (f) => f.settings.modId) ?? "");
    const [quality, setQuality] = useState<number | null>(() => sharedValue(files, (f) => f.settings.quality));
    const [density, setDensity] = useState<number | null>(() => sharedValue(files, (f) => f.settings.density));
    const [solidFill, setSolidFill] = useState<boolean | null>(() => sharedValue(files, (f) => f.settings.solidFill));
    const [optimizationMode, setOptimizationMode] = useState<OptimizationMode | null>(
        () => sharedValue(files, (f) => f.settings.optimizationMode)
    );

    const sharedOutputDir = sharedValue(files, (f) => f.settings.outputDir ?? "");
    const sharedModId = sharedValue(files, (f) => f.settings.modId);
    const sharedQuality = sharedValue(files, (f) => f.settings.quality);
    const sharedDensity = sharedValue(files, (f) => f.settings.density);
    const sharedSolid = sharedValue(files, (f) => f.settings.solidFill);
    const sharedOptimization = sharedValue(files, (f) => f.settings.optimizationMode);

    async function browseOutput() {
        const dir = await open({directory: true, title: "Select Output Directory"});
        if (dir && typeof dir === "string") setOutputDir(dir);
    }

    function handleApply() {
        const patch: Partial<FileSettings> = {};
        if (outputDir !== (sharedOutputDir ?? "")) patch.outputDir = outputDir || null;
        if (modId && modId !== sharedModId) patch.modId = modId;
        if (quality !== null && quality !== sharedQuality) patch.quality = quality;
        if (density !== null && density !== sharedDensity) patch.density = density;
        if (solidFill !== null && solidFill !== sharedSolid) patch.solidFill = solidFill;
        if (optimizationMode !== null && optimizationMode !== sharedOptimization) patch.optimizationMode = optimizationMode;
        applySettingsToIds(ids, patch);
    }

    const anyRunning = files.some(
        (f) => f.status === "running" || f.status === "paused"
    );

    return (
        <div className="h-full overflow-y-auto p-5 flex flex-col gap-5">
            {/* Header */}
            <div className="flex items-center gap-2 pb-2 border-b border-border">
                <div className="w-1.5 h-1.5 rounded-full bg-accent"/>
                <span className="text-sm font-medium text-text-primary">
          Editing {files.length} files
        </span>
                <span className="text-xs text-text-muted ml-auto">
          Model Name and Source Path are per-file only
        </span>
            </div>

            <p className="text-xs text-text-muted -mt-3">
                Only changed fields are applied. Fields showing{" "}
                <span className="text-text-secondary italic">multiple values</span>{" "}
                will not change unless you edit them.
            </p>

            {/* OUTPUT DIR */}
            <Section label="Output Directory">
                <div className="flex gap-2">
                    <input
                        className="field flex-1 text-xs"
                        value={outputDir}
                        placeholder={sharedOutputDir !== null ? (sharedOutputDir || "(global default)") : "(multiple values)"}
                        disabled={anyRunning}
                        onChange={(e) => setOutputDir(e.target.value)}
                    />
                    <button className="btn-ghost px-2" onClick={browseOutput} disabled={anyRunning}>
                        <FolderOpen size={14}/>
                    </button>
                </div>
            </Section>

            {/* MOD ID */}
            <Section label="Mod ID">
                <input
                    className={`field mono ${modId && !isValidModId(modId) ? "border-error/60" : ""}`}
                    value={modId}
                    placeholder={sharedModId !== null ? sharedModId : "(multiple values)"}
                    disabled={anyRunning}
                    onChange={(e) => setModId(e.target.value)}
                />
                {modId && !isValidModId(modId) && (
                    <p className="text-[11px] text-error mt-1">
                        Lowercase, numbers, _ and - only
                    </p>
                )}
            </Section>

            {/* QUALITY */}
            <Section label="Quality">
                <div className="flex gap-0.5">
                    {[1, 2, 3, 4, 5, 6, 7].map((q) => (
                        <button
                            key={q}
                            className={`quality-segment ${quality === q ? "active" : ""}`}
                            disabled={anyRunning}
                            onClick={() => setQuality(q === quality ? null : q)}
                            title={QUALITY_LABELS[q]}
                        >
                            {q}
                        </button>
                    ))}
                </div>
                {quality !== null ? (
                    <p className="text-[11px] text-text-muted mt-1">
                        {QUALITY_LABELS[quality]} — {QUALITY_RESOLUTION[quality]}³ grid
                    </p>
                ) : (
                    <p className="text-[11px] text-text-muted mt-1 italic">
                        {sharedQuality !== null ? `Currently Q${sharedQuality} for all` : "Multiple values — click to override"}
                    </p>
                )}
            </Section>

            {/* DENSITY */}
            <Section label="Texture Density">
                <select
                    className="field"
                    value={density ?? ""}
                    disabled={anyRunning}
                    onChange={(e) => setDensity(e.target.value === "" ? null : parseInt(e.target.value))}
                >
                    <option value="">
                        {sharedDensity !== null ? `Keep current (${sharedDensity === 0 ? "Auto" : sharedDensity})` : "(multiple values — keep)"}
                    </option>
                    <option value={0}>Auto (recommended)</option>
                    {DENSITY_PRESETS.filter((d) => d > 0).map((d) => (
                        <option key={d} value={d}>{d} px/voxel</option>
                    ))}
                </select>
            </Section>

            {/* SOLID FILL */}
            <Section label="Solid Fill">
                <div className="flex gap-2">
                    {[null, false, true].map((v) => (
                        <button
                            key={String(v)}
                            className={`btn-ghost text-xs px-3 py-1 ${solidFill === v ?
                                "border-accent text-accent" : ""}`}
                            disabled={anyRunning}
                            onClick={() => setSolidFill(v)}
                        >
                            {v === null ? "Keep" : v ? "On" : "Off"}
                        </button>
                    ))}
                </div>
                {sharedSolid !== null && solidFill === null && (
                    <p className="text-[11px] text-text-muted mt-1">
                        Currently {sharedSolid ? "enabled" : "disabled"} for all selected files
                    </p>
                )}
            </Section>

            {/* OPTIMIZATION MODE */}
            <Section label="Optimization">
                <div className="flex gap-2">
                    {([null, "element", "atlas"] as const).map((v) => (
                        <button
                            key={String(v)}
                            className={`btn-ghost text-xs px-3 py-1 ${optimizationMode === v ?
                                "border-accent text-accent" : ""}`}
                            disabled={anyRunning}
                            onClick={() => setOptimizationMode(v)}
                        >
                            {v === null ? "Keep" : v === "element" ? "Element" : "Atlas"}
                        </button>
                    ))}
                </div>
                {sharedOptimization !== null && optimizationMode === null && (
                    <p className="text-[11px] text-text-muted mt-1">
                        Currently {sharedOptimization} for all selected files
                    </p>
                )}
                {optimizationMode !== null && (
                    <p className="text-[11px] text-text-muted mt-1">
                        {optimizationMode === "element"
                            ? "3-D box merging — fewer MC elements"
                            : "Dual-pass 2-D greedy — fewer atlas pixels"}
                    </p>
                )}
            </Section>

            {/* Apply button */}
            <div className="mt-auto pt-4 border-t border-border">
                <button
                    className="btn-primary w-full justify-center"
                    onClick={handleApply}
                    disabled={anyRunning}
                >
                    Apply to {files.length} files
                </button>
                {anyRunning && (
                    <p className="text-[11px] text-text-muted mt-2 text-center">
                        Some selected files are currently running — wait for them to finish.
                    </p>
                )}
            </div>
        </div>
    );
}

function Section({label, children}: { label: string; children: React.ReactNode }) {
    return (
        <div>
            <p className="text-[10px] font-semibold text-text-muted uppercase tracking-widest mb-2">
                {label}
            </p>
            {children}
        </div>
    );
}
