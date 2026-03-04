import React, {useState} from "react";
import {FolderOpen} from "lucide-react";
import {open} from "@tauri-apps/plugin-dialog";
import type {FileEntry, FileSettings} from "@/types";
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

export function BatchSettings({files}: Props) {
    const {applySettingsToIds} = useAppStore.getState();
    const ids = files.map((f) => f.id);

    const anyRunning = files.some((f) => f.status === "running" || f.status === "paused");

    // Local draft for batch fields
    const [outputDir, setOutputDir] = useState<string>(() => sharedValue(files, (f) => f.settings.outputDir ?? "") ?? "");
    const [modId, setModId] = useState<string>(() => sharedValue(files, (f) => f.settings.modId) ?? "");
    const [quality, setQuality] = useState<number | null>(() => sharedValue(files, (f) => f.settings.quality));
    const [density, setDensity] = useState<number | null>(() => sharedValue(files, (f) => f.settings.density));
    const [solidFill, setSolidFill] = useState<boolean | null>(() => sharedValue(files, (f) => f.settings.solidFill));

    const sharedOutputDir = sharedValue(files, (f) => f.settings.outputDir ?? "");
    const sharedModId = sharedValue(files, (f) => f.settings.modId);
    const sharedQuality = sharedValue(files, (f) => f.settings.quality);
    const sharedDensity = sharedValue(files, (f) => f.settings.density);
    const sharedSolid = sharedValue(files, (f) => f.settings.solidFill);

    async function browseOutput() {
        const dir = await open({directory: true, title: "Select Output Directory"});
        if (dir && typeof dir === "string") setOutputDir(dir);
    }

    function handleApply() {
        const patch: Partial<FileSettings> = {};
        if (outputDir !== (sharedOutputDir ?? "")) patch.outputDir = outputDir || null;
        if (modId !== (sharedModId ?? "") && (!modId || isValidModId(modId))) patch.modId = modId;
        if (quality !== null) patch.quality = quality;
        if (density !== null) patch.density = density;
        if (solidFill !== null) patch.solidFill = solidFill;
        if (Object.keys(patch).length > 0) applySettingsToIds(ids, patch);
    }

    return (
        <div className="h-full overflow-y-auto flex flex-col">
            <div className="flex-1 p-5 flex flex-col gap-5">

                {/* HEADER */}
                <div className="text-sm text-text-secondary">
                    Editing <span className="font-semibold text-text-primary">{files.length}</span> files.
                    Only changed fields will be applied.
                </div>

                {/* OUTPUT DIRECTORY */}
                <Section label="Output">
                    <Field label="Directory (leave blank to keep per-file settings)">
                        <div className="flex gap-2">
                            <input
                                className="field flex-1 text-xs"
                                value={outputDir}
                                placeholder={sharedOutputDir !== null ? sharedOutputDir || "(per-file default)" : "(multiple values)"}
                                disabled={anyRunning}
                                onChange={(e) => setOutputDir(e.target.value)}
                            />
                            <button className="btn-ghost px-2" onClick={browseOutput} disabled={anyRunning}>
                                <FolderOpen size={14}/>
                            </button>
                        </div>
                    </Field>
                </Section>

                {/* MOD ID */}
                <Section label="Mod ID">
                    <Field label="">
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
                    </Field>
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

                {/* DENSITY — Fix #2: Keep / Auto / 1 / 2 / 3 … / 64 */}
                <Section label="Texture Density">
                    <select
                        className="field"
                        value={density ?? ""}
                        disabled={anyRunning}
                        onChange={(e) => setDensity(e.target.value === "" ? null : parseInt(e.target.value))}
                    >
                        {/* "Keep" is unique to multi-file editing */}
                        <option value="">
                            {sharedDensity !== null
                                ? `Keep current (${sharedDensity === 0 ? "Auto" : sharedDensity})`
                                : "(multiple values — keep)"}
                        </option>
                        <option value={0}>Auto (recommended)</option>
                        {Array.from({length: 64}, (_, i) => i + 1).map((d) => (
                            <option key={d} value={d}>{d} px</option>
                        ))}
                    </select>
                </Section>

                {/* SOLID FILL */}
                <Section label="Solid Fill">
                    <div className="flex gap-2">
                        {([null, false, true] as const).map((v) => (
                            <button
                                key={String(v)}
                                className={`btn-ghost text-xs px-3 py-1 ${solidFill === v
                                    ? "border-accent text-accent bg-accent/10"
                                    : ""}`}
                                disabled={anyRunning}
                                onClick={() => setSolidFill(v)}
                            >
                                {v === null ? "Keep" : v ? "On" : "Off"}
                            </button>
                        ))}
                    </div>
                    {sharedSolid !== null && solidFill === null && (
                        <p className="text-[11px] text-text-muted mt-1 italic">
                            Currently {sharedSolid ? "on" : "off"} for all
                        </p>
                    )}
                </Section>
            </div>

            {/* FOOTER */}
            <div className="border-t border-border px-5 py-3 flex-shrink-0">
                <button
                    className="btn-primary w-full text-sm"
                    onClick={handleApply}
                    disabled={anyRunning}
                >
                    Apply to {files.length} files
                </button>
            </div>
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
