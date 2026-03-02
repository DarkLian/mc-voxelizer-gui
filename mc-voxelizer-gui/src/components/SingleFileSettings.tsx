import {useState} from "react";
import {ChevronDown, FolderOpen, Info} from "lucide-react";
import {open} from "@tauri-apps/plugin-dialog";
import type {FileEntry, FileSettings} from "@/types";
import {QUALITY_LABELS, QUALITY_RESOLUTION} from "@/types";
import {useAppStore} from "@/store/useAppStore";
import {isValidModelName, isValidModId, resolveOutputDir} from "@/utils/pathUtils";

interface Props {
    file: FileEntry;
}

const DENSITY_PRESETS = [0, 1, 2, 4, 8, 16, 32];

export function SingleFileSettings({file}: Props) {
    const {updateSettings, applySettingsToIds, files} =
        useAppStore.getState();
    const prefs = useAppStore((s) => s.preferences);
    const [applyMenuOpen, setApplyMenuOpen] = useState(false);

    const s = file.settings;
    const isReadOnly = file.status === "running" || file.status === "paused";
    const gridRes = QUALITY_RESOLUTION[s.quality] ?? 32;
    const atlasEstimate =
        s.density === 0 ? `~${gridRes * 8}` : `~${gridRes * s.density}`;

    function patch(p: Partial<FileSettings>) {
        updateSettings(file.id, p);
    }

    async function browseOutput() {
        const dir = await open({directory: true, title: "Select Output Directory"});
        if (dir && typeof dir === "string") patch({outputDir: dir});
    }

    const effectiveOutputDir = resolveOutputDir(
        s.outputDir,
        file.sourcePath,
        prefs.defaultOutputMode,
        prefs.defaultOutputDir
    );

    const outputDirSource = s.outputDir
        ? "per-file"
        : prefs.defaultOutputMode === "alongside"
            ? "alongside"
            : "global default";

    // ── Apply to scope ────────────────────────────────────────────────────────

    const allIds = files.map((f) => f.id);

    function applyTo(scope: "all" | "quality" | "density" | "modId" | "outputDir") {
        const patch: Partial<FileSettings> =
            scope === "all" ? {...s}
                : scope === "quality" ? {quality: s.quality}
                    : scope === "density" ? {density: s.density}
                        : scope === "modId" ? {modId: s.modId}
                            : {outputDir: s.outputDir};
        applySettingsToIds(allIds, patch);
        setApplyMenuOpen(false);
    }

    return (
        <div className="h-full overflow-y-auto p-5 flex flex-col gap-5">

            {/* SOURCE */}
            <Section label="Source">
                <Field label="File">
                    <div className="field text-text-muted truncate text-xs py-2" title={file.sourcePath}>
                        {file.sourcePath}
                    </div>
                </Field>
            </Section>

            {/* OUTPUT */}
            <Section label="Output">
                <Field label="Directory">
                    <div className="flex gap-2">
                        <input
                            className="field flex-1 text-xs"
                            value={s.outputDir ?? ""}
                            placeholder={`${effectiveOutputDir}  (${outputDirSource})`}
                            disabled={isReadOnly}
                            onChange={(e) => patch({outputDir: e.target.value || null})}
                        />
                        <button className="btn-ghost px-2" onClick={browseOutput} disabled={isReadOnly}>
                            <FolderOpen size={14}/>
                        </button>
                    </div>
                    <p className="text-[11px] text-text-muted mt-1">
                        Effective: <span className="mono">{effectiveOutputDir}</span>
                        <span className="ml-1 text-text-muted opacity-60">({outputDirSource})</span>
                    </p>
                </Field>

                <Field label="Model Name">
                    <input
                        className={`field ${!isValidModelName(s.modelName) ? "border-error/60" : ""}`}
                        value={s.modelName}
                        disabled={isReadOnly}
                        onChange={(e) => patch({modelName: e.target.value})}
                        placeholder="model_name"
                    />
                    {!isValidModelName(s.modelName) && (
                        <p className="text-[11px] text-error mt-1">
                            Lowercase letters, numbers, _ and - only (max 64 chars)
                        </p>
                    )}
                    <p className="text-[11px] text-text-muted mt-1 mono">
                        → {effectiveOutputDir}/{s.modelName}.json + .png
                    </p>
                </Field>
            </Section>

            {/* IDENTITY */}
            <Section label="Identity">
                <Field label="Mod ID">
                    <input
                        className={`field mono ${!isValidModId(s.modId) ? "border-error/60" : ""}`}
                        value={s.modId}
                        disabled={isReadOnly}
                        onChange={(e) => patch({modId: e.target.value})}
                        placeholder="darkaddons"
                    />
                    {!isValidModId(s.modId) && (
                        <p className="text-[11px] text-error mt-1">
                            Lowercase, numbers, _ and - only (max 32 chars)
                        </p>
                    )}
                    <p className="text-[11px] text-text-muted mt-1 mono">
                        → {s.modId}:item/{s.modelName}
                    </p>
                </Field>
            </Section>

            {/* VOXELIZATION */}
            <Section label="Voxelization">
                <Field label={`Quality — ${gridRes}³ grid`}>
                    <div className="flex gap-0.5">
                        {[1, 2, 3, 4, 5, 6, 7].map((q) => (
                            <button
                                key={q}
                                className={`quality-segment ${s.quality === q ? "active" : ""}`}
                                disabled={isReadOnly}
                                onClick={() => patch({quality: q})}
                                title={QUALITY_LABELS[q]}
                            >
                                {q}
                            </button>
                        ))}
                    </div>
                    <p className="text-[11px] text-text-muted mt-1">{QUALITY_LABELS[s.quality]}</p>
                </Field>

                <Field label="Texture Density">
                    <div className="flex gap-2">
                        <select
                            className="field flex-1"
                            value={s.density}
                            disabled={isReadOnly}
                            onChange={(e) => patch({density: parseInt(e.target.value)})}
                        >
                            <option value={0}>Auto (recommended)</option>
                            {DENSITY_PRESETS.filter((d) => d > 0).map((d) => (
                                <option key={d} value={d}>{d} px/voxel</option>
                            ))}
                        </select>
                    </div>
                    <p className="text-[11px] text-text-muted mt-1">
                        {s.density === 0
                            ? "Resolved by the binary after loading the source texture"
                            : `Atlas: ${atlasEstimate} × ${atlasEstimate} px before packing`}
                    </p>
                </Field>

                <Field label="">
                    <label className="flex items-center gap-2 cursor-pointer select-none">
                        <input
                            type="checkbox"
                            className="checkbox"
                            checked={s.solidFill}
                            disabled={isReadOnly}
                            onChange={(e) => patch({solidFill: e.target.checked})}
                        />
                        <span className="text-sm text-text-secondary">
              Solid fill (fill interior voxels)
            </span>
                    </label>
                    <p className="text-[11px] text-text-muted mt-1 ml-6">
                        Increases element count. Off recommended for hollow models.
                    </p>
                </Field>
            </Section>

            {/* ESTIMATED OUTPUT */}
            <Section label="Estimated Output">
                <div className="bg-card rounded-md p-3 flex flex-col gap-1.5">
                    <Row k="Grid resolution" v={`${gridRes}³ = ${gridRes ** 3} voxels`}/>
                    <Row k="Atlas size (approx)" v={`${atlasEstimate} × ${atlasEstimate} px`}/>
                    {s.density > 16 && (
                        <p className="text-[11px] text-warning flex items-center gap-1 mt-1">
                            <Info size={11}/>
                            Density above 16 rarely adds detail — try auto first.
                        </p>
                    )}
                </div>
            </Section>

            {/* Footer buttons */}
            <div className="flex gap-2 mt-auto pt-2 border-t border-border">
                {/* Apply to all dropdown */}
                <div className="relative">
                    <button
                        className="btn-ghost text-xs flex items-center gap-1"
                        onClick={() => setApplyMenuOpen((v) => !v)}
                        disabled={isReadOnly}
                    >
                        Apply to…
                        <ChevronDown size={12}/>
                    </button>

                    {applyMenuOpen && (
                        <>
                            <div className="fixed inset-0 z-40" onClick={() => setApplyMenuOpen(false)}/>
                            <div className="absolute bottom-full mb-1 left-0 z-50 bg-panel border border-border-bright
                              rounded-md shadow-xl min-w-[200px] py-1 animate-fade-in">
                                <ApplyItem label="All settings → all files" onClick={() => applyTo("all")}/>
                                <ApplyItem label="Quality → all files" onClick={() => applyTo("quality")}/>
                                <ApplyItem label="Density → all files" onClick={() => applyTo("density")}/>
                                <ApplyItem label="Mod ID → all files" onClick={() => applyTo("modId")}/>
                                <ApplyItem label="Output dir → all files" onClick={() => applyTo("outputDir")}/>
                            </div>
                        </>
                    )}
                </div>
            </div>
        </div>
    );
}

// ── Small layout helpers ──────────────────────────────────────────────────────

function Section({label, children}: { label: string; children: React.ReactNode }) {
    return (
        <div>
            <p className="text-[10px] font-semibold text-text-muted uppercase tracking-widest mb-2">
                {label}
            </p>
            <div className="flex flex-col gap-3">{children}</div>
        </div>
    );
}

function Field({label, children}: { label: string; children: React.ReactNode }) {
    return (
        <div>
            {label && (
                <label className="block text-xs text-text-secondary mb-1">{label}</label>
            )}
            {children}
        </div>
    );
}

function Row({k, v}: { k: string; v: string }) {
    return (
        <div className="flex justify-between text-xs">
            <span className="text-text-muted">{k}</span>
            <span className="text-text-primary mono">{v}</span>
        </div>
    );
}

function ApplyItem({label, onClick}: { label: string; onClick: () => void }) {
    return (
        <button
            className="flex items-center w-full px-3 py-1.5 text-xs text-text-secondary
                 hover:bg-card-hover hover:text-text-primary transition-colors"
            onClick={onClick}
        >
            {label}
        </button>
    );
}
