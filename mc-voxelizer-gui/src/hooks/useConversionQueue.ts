/**
 * useConversionQueue
 *
 * Drives the sequential conversion loop:
 *   1. Watch for a non-null advanceQueue() result.
 *   2. Spawn mc_voxelizer as a Tauri sidecar with the file's settings.
 *   3. Stream stdout/stderr into the log and update progress.
 *   4. On close, mark done/error and advance the queue again.
 *
 * Suspend/resume is handled via custom Tauri commands (Rust, Windows-only).
 */

import {useCallback, useEffect, useRef} from "react";
import {type Child, Command} from "@tauri-apps/plugin-shell";
import {invoke} from "@tauri-apps/api/core";
import {useAppStore} from "@/store/useAppStore";
import {resolveOutputDir} from "@/utils/pathUtils";
import {detectLogLevel, isPausePrompt, progressFromLine} from "@/utils/logParser";
import type {OptimizationMode} from "@/types";

// Sidecar names registered in tauri.conf.json bundle.externalBin
const SIDECAR_NAMES: Record<OptimizationMode, string> = {
    element: "binaries/mc_voxelizer_element-v1.5.0",
    atlas: "binaries/mc_voxelizer_atlas-v1.5.0",
};

export function useConversionQueue() {
    const childRef = useRef<Child | null>(null);
    const timerRef = useRef<ReturnType<typeof setInterval> | null>(null);
    const startTimeRef = useRef<number>(0);
    const finishedRef = useRef<boolean>(false);

    // ── Cleanup helper ───────────────────────────────────────────────────────

    function cleanup() {
        if (timerRef.current) {
            clearInterval(timerRef.current);
            timerRef.current = null;
        }
        childRef.current = null;
        finishedRef.current = false;
    }

    // ── Start a single conversion ────────────────────────────────────────────

    const runFile = useCallback(async (fileId: string) => {
        finishedRef.current = false;

        const {files, preferences, setStatus, setPid, addLogLine, finishFile, advanceQueue} =
            useAppStore.getState();

        const file = files.find((f) => f.id === fileId);
        if (!file) return;

        setStatus(fileId, "running");
        startTimeRef.current = Date.now();

        const outDir = resolveOutputDir(
            file.settings.outputDir,
            file.sourcePath,
            preferences.defaultOutputMode,
            preferences.defaultOutputDir
        );

        const args: string[] = [
            file.sourcePath,
            "--quality", String(file.settings.quality),
            "--output", outDir,
            "--name", file.settings.modelName,
            "--modid", file.settings.modId,
        ];
        if (file.settings.density > 0) {
            args.push("--density", String(file.settings.density));
        }
        if (file.settings.solidFill) {
            args.push("--solid");
        }

        timerRef.current = setInterval(() => {
            useAppStore.getState().setElapsed(fileId, Date.now() - startTimeRef.current);
        }, 500);

        async function replyEnter() {
            try {
                if (childRef.current) await childRef.current.write("\n");
            } catch (_) { /* ignore */
            }
        }

        function finish(success: boolean, outputJson?: string, outputPng?: string) {
            if (finishedRef.current) return;
            finishedRef.current = true;
            if (timerRef.current) {
                clearInterval(timerRef.current);
                timerRef.current = null;
            }
            const elapsed = Date.now() - startTimeRef.current;
            useAppStore.getState().setElapsed(fileId, elapsed);
            finishFile(fileId, success, outputJson, outputPng);
            childRef.current = null;
            const nextId = advanceQueue();
            if (nextId) runFile(nextId);
        }

        try {
            // ?? "element" guards against undefined from stale persisted file
            // settings that predate the optimizationMode field (issues 8 & 9).
            const mode: OptimizationMode = file.settings.optimizationMode ?? "element";
            const sidecarName = preferences.binaryPath ?? SIDECAR_NAMES[mode];

            const command = Command.sidecar(sidecarName, args);

            command.stdout.on("data", async (line: string) => {
                const level = detectLogLevel(line);
                useAppStore.getState().addLogLine(fileId, {
                    timestamp: new Date(),
                    level,
                    text: line,
                });

                const p = progressFromLine(line);
                if (p !== null) useAppStore.getState().setProgress(fileId, p);

                if (line.includes("Done!")) await replyEnter();
                if (isPausePrompt(line)) await replyEnter();
            });

            command.stderr.on("data", async (line: string) => {
                useAppStore.getState().addLogLine(fileId, {
                    timestamp: new Date(),
                    level: "warning",
                    text: line,
                });
                if (line.includes("Fatal error:") || isPausePrompt(line)) {
                    await replyEnter();
                }
            });

            command.on("close", (data: { code: number | null }) => {
                const success = data.code === 0;
                const outputJson = success ? `${outDir}/${file.settings.modelName}.json` : undefined;
                const outputPng = success ? `${outDir}/${file.settings.modelName}.png` : undefined;
                finish(success, outputJson, outputPng);
            });

            command.on("error", (err: string) => {
                useAppStore.getState().addLogLine(fileId, {
                    timestamp: new Date(),
                    level: "error",
                    text: `Process error: ${err}`,
                });
                finish(false);
            });

            const child = await command.spawn();
            childRef.current = child;
            setPid(fileId, child.pid);

        } catch (err) {
            if (timerRef.current) {
                clearInterval(timerRef.current);
                timerRef.current = null;
            }
            addLogLine(fileId, {
                timestamp: new Date(),
                level: "error",
                text: `Failed to launch binary: ${String(err)}`,
            });
            finishFile(fileId, false);
            childRef.current = null;
            const nextId = advanceQueue();
            if (nextId) await runFile(nextId);
        }
    }, []);

    // ── Watch the queue and auto-start ──────────────────────────────────────

    useEffect(() => {
        return useAppStore.subscribe((state) => {
            if (state.activeId === null && state.conversionQueue.length > 0) {
                const nextId = state.advanceQueue();
                if (nextId) runFile(nextId);
            }
        });
    }, [runFile]);

    // ── Pause / resume ───────────────────────────────────────────────────────

    const pauseActive = useCallback(async () => {
        const {activeId, files, setStatus} = useAppStore.getState();
        if (!activeId) return;
        const file = files.find((f) => f.id === activeId);
        if (!file || file.status !== "running") return;
        try {
            await invoke("suspend_process", {pid: file.pid});
            setStatus(activeId, "paused");
        } catch (err) {
            console.error("Failed to suspend process:", err);
        }
    }, []);

    const resumeActive = useCallback(async () => {
        const {activeId, files, setStatus} = useAppStore.getState();
        if (!activeId) return;
        const file = files.find((f) => f.id === activeId);
        if (!file || file.status !== "paused") return;
        try {
            await invoke("resume_process", {pid: file.pid});
            setStatus(activeId, "running");
        } catch (err) {
            console.error("Failed to resume process:", err);
        }
    }, []);

    // ── Cancel ───────────────────────────────────────────────────────────────

    const killActive = useCallback(async () => {
        finishedRef.current = true;
        cleanup();
        const {activeId, files} = useAppStore.getState();
        if (!activeId) return;
        const file = files.find((f) => f.id === activeId);
        if (!file) return;
        try {
            if (childRef.current) await childRef.current.kill();
        } catch (_) { /* ignore */
        }
        useAppStore.getState().forceResetActive();
    }, []);

    const forceReset = useCallback(async () => {
        if (childRef.current) {
            try {
                await childRef.current.kill();
            } catch { /* ignore */
            }
        }
        cleanup();
        useAppStore.getState().forceResetActive();
    }, []);

    return {pauseActive, resumeActive, killActive, forceReset};
}