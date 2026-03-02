import {useState} from "react";
import {ChevronDown, FolderOpen} from "lucide-react";
import {open} from "@tauri-apps/plugin-dialog";
import type {FileEntry, FileSettings} from "@/types";
import {QUALITY_LABELS, QUALITY_RESOLUTION} from "@/types";
import {useAppStore} from "@/store/useAppStore";
import {isValidModelName, isValidModId, resolveOutputDir} from "@/utils/pathUtils";

interface Props {
    file: FileEntry;
}

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
        const p: Partial<FileSettings> =
            scope === "all" ? {...s}
                : scope === "quality" ? {quality: s.quality}
                    : scope === "density" ? {density: s.density}
                        : scope === "modId" ? {modId: s.modId}
                            : {outputDir: s.outputDir};
        applySettingsToIds(allIds, p);
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
                            placeholder={`${effectiveOutputDir} (${outputDirSource})`}
                            readOnly={isReadOnly}
                            onChange={(e) => patch({outputDir: e.target.value || null})}
                        />
                        <button className="btn-ghost px-2" onClick={browseOutput} disabled={isReadOnly}>
                            <FolderOpen size={14}/>
                        </button>
                    </div>
                    {!s.outputDir && (
                        <p className="text-[11px] text-text-muted mt-1 truncate">
                            → {effectiveOutputDir}
                        </p>
                    )}
                </Field>

                <Field label="Model Name">
                    <input
                        className={`field text-sm ${s.modelName && !isValidModelName(s.modelName) ? "border-error/60" : ""}`}
                        value={s.modelName}
                        readOnly={isReadOnly}
                        onChange={(e) => patch({modelName: e.target.value})}
                    />
                </Field>

                <Field label="Mod ID">
                    <input
                        className={`field mono text-sm ${s.modId && !isValidModId(s.modId) ? "border-error/60" : ""}`}
                        value={s.modId}
                        readOnly={isReadOnly}
                        onChange={(e) => patch({modId: e.target.value})}
                    />
                </Field>
            </Section>

            {/* QUALITY */}
            <Section label="Quality">
                <Field label="Quality Level">
                    <select
                        className="field"
                        value={s.quality}
                        disabled={isReadOnly}
                        onChange={(e) => patch({quality: parseInt(e.target.value)})}
                    >
                        {[1, 2, 3, 4, 5, 6, 7].map((q) => (
                            <option key={q} value={q}>Q{q} — {QUALITY_LABELS[q]}</option>
                        ))}
                    </select>
                </Field>
            </Section>

            {/* DENSITY */}
            <Section label="Pixel Density">
                <Field label={`Density: ${s.density === 0 ? "Auto" : `${s.density}px`}`}>
                    <div className="flex items-center gap-3">
                        <span className="text-xs text-text-muted w-8 shrink-0">Auto</span>
                        <input
                            type="range"
                            min={0}
                            max={64}
                            step={1}
                            value={s.density}
                            disabled={isReadOnly}
                            onChange={(e) => patch({density: parseInt(e.target.value)})}
                            className="flex-1 accent-accent"
                        />
                        <span className="text-xs text-text-muted w-8 shrink-0 text-right">64px</span>
                    </div>
                    <div className="flex justify-between mt-1">
                        <span className="text-[11px] text-text-muted">
                            {s.density === 0 ? "Resolved automatically by the binary" : `${s.density} pixels per voxel face`}
                        </span>
                        <span className="text-[11px] text-text-muted mono">
                            atlas ~{atlasEstimate}px
                        </span>
                    </div>
                    {s.density === 0 && (
                        <button
                            className="text-[11px] text-accent underline mt-1"
                            onClick={() => patch({density: 0})}
                        >
                            Reset to Auto
                        </button>
                    )}
                </Field>

                <Field label="">
                    <label className="flex items-center gap-2 cursor-pointer select-none">
                        <input
                            type="checkbox"
                            checked={s.solidFill}
                            disabled={isReadOnly}
                            onChange={(e) => patch({solidFill: e.target.checked})}
                            className="accent-accent"
                        />
                        <span className="text-sm text-text-secondary">Solid fill (no transparency)</span>
                    </label>
                </Field>
            </Section>

            {/* APPLY TO ALL */}
            {files.length > 1 && (
                <div className="relative">
                    <button
                        className="btn-ghost text-xs w-full flex items-center justify-center gap-1"
                        onClick={() => setApplyMenuOpen((v) => !v)}
                    >
                        Apply settings to all files
                        <ChevronDown size={12}/>
                    </button>

                    {applyMenuOpen && (
                        <>
                            <div className="fixed inset-0 z-10" onClick={() => setApplyMenuOpen(false)}/>
                            <div className="absolute bottom-full left-0 right-0 mb-1 z-20
                                    bg-panel border border-border-bright rounded-lg shadow-2xl py-1">
                                {(["all", "quality", "density", "modId", "outputDir"] as const).map((scope) => (
                                    <button
                                        key={scope}
                                        className="flex w-full px-4 py-1.5 text-xs text-left
                                         text-text-secondary hover:bg-card-hover hover:text-text-primary transition-colors"
                                        onClick={() => applyTo(scope)}
                                    >
                                        {scope === "all" ? "All settings"
                                            : scope === "quality" ? "Quality only"
                                                : scope === "density" ? "Density only"
                                                    : scope === "modId" ? "Mod ID only"
                                                        : "Output directory only"}
                                    </button>
                                ))}
                            </div>
                        </>
                    )}
                </div>
            )}
        </div>
    );
}

function Section({label, children}: { label: string; children: React.ReactNode }) {
    return (
        <div>
            <p className="text-[10px] font-semibold text-text-muted uppercase tracking-widest mb-3">
                {label}
            </p>
            <div className="flex flex-col gap-3">{children}</div>
        </div>
    );
}

function Field({label, children}: { label: string; children: React.ReactNode }) {
    return (
        <div>
            {label && <label className="block text-xs text-text-secondary mb-1">{label}</label>}
            {children}
        </div>
    );
}
