import React, {useState} from "react";
import {FolderOpen, X} from "lucide-react";
import {open} from "@tauri-apps/plugin-dialog";
import {useAppStore} from "@/store/useAppStore";
import {DEFAULT_PREFERENCES, QUALITY_LABELS} from "@/types";
import {isValidModId} from "@/utils/pathUtils";

export function PreferencesModal() {
    const prefs = useAppStore((s) => s.preferences);
    const {closePrefs, updatePreferences, resetPreferences} = useAppStore.getState();

    const [draft, setDraft] = useState({...prefs});

    function save() {
        updatePreferences(draft);
        closePrefs();
    }

    function patch(p: Partial<typeof draft>) {
        setDraft((d) => ({...d, ...p}));
    }

    async function browseDefault() {
        const dir = await open({directory: true, title: "Default Output Directory"});
        if (dir && typeof dir === "string") patch({defaultOutputDir: dir});
    }

    async function browseBinary() {
        const file = await open({
            filters: [{name: "Executable", extensions: ["exe"]}],
            title: "Select mc_voxelizer binary",
        });
        if (file && typeof file === "string") patch({binaryPath: file});
    }

    return (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 animate-fade-in">
            <div className="bg-panel border border-border-bright rounded-xl shadow-2xl
                      w-full max-w-md max-h-[85vh] flex flex-col">

                {/* Header */}
                <div className="flex items-center gap-2 px-5 py-3.5 border-b border-border flex-shrink-0">
                    <span className="font-semibold text-text-primary">Preferences</span>
                    <button className="btn-icon ml-auto" onClick={closePrefs}>
                        <X size={15}/>
                    </button>
                </div>

                {/* Scrollable body */}
                <div className="overflow-y-auto flex-1 px-5 py-4 flex flex-col gap-5">

                    {/* DEFAULTS */}
                    <Section label="Defaults (applied to newly added files)">

                        <Field label="Default Output Directory">
                            <div className="flex gap-2">
                                <input
                                    className="field flex-1 text-xs"
                                    value={draft.defaultOutputDir}
                                    onChange={(e) => patch({defaultOutputDir: e.target.value})}
                                    placeholder="e.g. C:\Users\you\Desktop"
                                />
                                <button className="btn-ghost px-2" onClick={browseDefault}>
                                    <FolderOpen size={14}/>
                                </button>
                            </div>
                        </Field>

                        <Field label="Output Mode">
                            <select
                                className="field"
                                value={draft.defaultOutputMode}
                                onChange={(e) =>
                                    patch({defaultOutputMode: e.target.value as "fixed" | "alongside"})
                                }
                            >
                                <option value="fixed">Fixed directory (use above)</option>
                                <option value="alongside">Alongside source file</option>
                            </select>
                        </Field>

                        <Field label="Default Mod ID">
                            <input
                                className={`field mono text-sm ${
                                    draft.defaultModId && !isValidModId(draft.defaultModId)
                                        ? "border-error/60"
                                        : ""
                                }`}
                                value={draft.defaultModId}
                                onChange={(e) => patch({defaultModId: e.target.value})}
                                placeholder="mymod"
                            />
                        </Field>

                        <Field label="Default Quality">
                            <select
                                className="field"
                                value={draft.defaultQuality}
                                onChange={(e) => patch({defaultQuality: parseInt(e.target.value)})}
                            >
                                {[1, 2, 3, 4, 5, 6, 7].map((q) => (
                                    <option key={q} value={q}>Q{q} — {QUALITY_LABELS[q]}</option>
                                ))}
                            </select>
                        </Field>

                        {/* issue 2: added space before "px" → "1 px", "2 px" etc. */}
                        <Field label="Default Density">
                            <select
                                className="field"
                                value={draft.defaultDensity}
                                onChange={(e) => patch({defaultDensity: parseInt(e.target.value)})}
                            >
                                <option value={0}>Auto (recommended)</option>
                                {Array.from({length: 64}, (_, i) => i + 1).map((d) => (
                                    <option key={d} value={d}>{d} px</option>
                                ))}
                            </select>
                        </Field>

                        {/* issue 3: defaultSolidFill is false in DEFAULT_PREFERENCES */}
                        <Field label="">
                            <label className="flex items-center gap-2 cursor-pointer select-none">
                                <input
                                    type="checkbox"
                                    checked={draft.defaultSolidFill}
                                    onChange={(e) => patch({defaultSolidFill: e.target.checked})}
                                    className="accent-accent"
                                />
                                <span className="text-sm text-text-secondary">Solid fill by default</span>
                            </label>
                        </Field>

                        {/* issue 5: updated descriptions */}
                        <Field label="Default Optimization">
                            <div className="flex gap-0.5">
                                <button
                                    className={`flex-1 btn-ghost text-xs py-1.5 rounded-r-none ${
                                        draft.defaultOptimizationMode === "element"
                                            ? "border-accent text-accent bg-accent/10"
                                            : ""
                                    }`}
                                    onClick={() => patch({defaultOptimizationMode: "element"})}
                                >
                                    Element Count
                                </button>
                                <button
                                    className={`flex-1 btn-ghost text-xs py-1.5 rounded-l-none ${
                                        draft.defaultOptimizationMode === "atlas"
                                            ? "border-accent text-accent bg-accent/10"
                                            : ""
                                    }`}
                                    onClick={() => patch({defaultOptimizationMode: "atlas"})}
                                >
                                    Atlas
                                </button>
                            </div>
                            <p className="text-[11px] text-text-muted mt-1">
                                {draft.defaultOptimizationMode === "element"
                                    ? "3-D box merging — fewer MC elements, but larger png size"
                                    : "Dual-pass 2-D greedy — smaller png size, but a lot more MC elements"}
                            </p>
                        </Field>

                    </Section>

                    {/* issue 4: Notifications section removed entirely */}

                    {/* ADVANCED */}
                    <Section label="Advanced">
                        <Field label="Custom Binary Path">
                            <div className="flex gap-2">
                                <input
                                    className="field flex-1 text-xs"
                                    value={draft.binaryPath ?? ""}
                                    placeholder="Leave blank for bundled binary"
                                    onChange={(e) =>
                                        patch({binaryPath: e.target.value || null})
                                    }
                                />
                                <button className="btn-ghost px-2" onClick={browseBinary}>
                                    <FolderOpen size={14}/>
                                </button>
                            </div>
                            <p className="text-[11px] text-text-muted mt-1">
                                Override the bundled mc_voxelizer executable with a custom build.
                            </p>
                        </Field>
                    </Section>

                </div>

                {/* Footer */}
                <div className="flex items-center gap-2 px-5 py-3 border-t border-border flex-shrink-0">
                    <button
                        className="btn-ghost text-xs text-error border-error/20 hover:bg-error/10"
                        onClick={() => {
                            resetPreferences();
                            setDraft({...DEFAULT_PREFERENCES});
                        }}
                    >
                        Reset to Defaults
                    </button>
                    <div className="flex-1"/>
                    <button className="btn-ghost" onClick={closePrefs}>Cancel</button>
                    <button className="btn-primary" onClick={save}>Save</button>
                </div>
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
